import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import type { Db } from '../db.ts';
import type { Instance } from '../instance.ts';
import { InstanceAlreadySetUpError } from '../instance.ts';
import { logFailure } from '../logging.ts';
import { type Auth, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './auth.ts';
import { LOCAL_LEARNER_ID } from './index.ts';

const firstAdmin = new AsyncLocalStorage<true>();

/** Runs `fn` as the first-admin sign-up; `registration.ts` admits only calls made inside it. */
const runAsFirstAdmin = <T>(fn: () => Promise<T>): Promise<T> => firstAdmin.run(true, fn);

/** True only inside `runAsFirstAdmin`; nothing in a request can set it. */
export const isFirstAdmin = (): boolean => firstAdmin.getStore() === true;

export interface FirstAdminInput {
	name: string;
	email: string;
	password: string;
	/**
	 * The caller is converting a Local Instance (C39): only then may a stored `local` mode be claimed.
	 * Set by the Setup route from `?convert`; left out, a Local Instance is refused as before.
	 */
	convert?: boolean;
}

// One first-admin attempt at a time in this process (the Instance is one process on one SQLite
// file), so the cleanup below can only ever remove the Account this very attempt made.
let queue: Promise<unknown> = Promise.resolve();
const exclusively = <T>(fn: () => Promise<T>): Promise<T> => {
	const run = queue.then(fn, fn);
	queue = run.catch(() => {});
	return run;
};

/** Multi-user cannot be chosen on this server (not released yet, or its secret or origin is missing). */
export class MultiUserNotAvailableError extends Error {
	constructor() {
		super('Multi-user is not available on this server.');
		this.name = 'MultiUserNotAvailableError';
	}
}

/** The first admin's form is wrong in one field; the message is fixed text, never the input. */
export class InvalidFirstAdminError extends Error {
	constructor(
		readonly field: 'name' | 'email' | 'password',
		message: string
	) {
		super(message);
		this.name = 'InvalidFirstAdminError';
	}
}

function validate({ name, email, password }: Pick<FirstAdminInput, 'name' | 'email' | 'password'>) {
	if (name.trim() === '') throw new InvalidFirstAdminError('name', 'The name is required.');
	if (!z.email().safeParse(email).success) {
		throw new InvalidFirstAdminError('email', 'The email address is not valid.');
	}
	if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
		throw new InvalidFirstAdminError(
			'password',
			`The password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`
		);
	}
}

/**
 * Claims the Instance as multi-user and signs the first admin up, who owns the `local` Learner
 * (so Local progress carries over). Returns the sign-up response's headers: their `Set-Cookie`
 * signs the admin in.
 *
 * Only an Instance with no stored mode can be claimed, or a Local one when `input.convert` says so
 * (C39). One that is multi (with Accounts or without), or that has any Account, is refused
 * (InstanceAlreadySetUpError). The check is made inside the lock, so it cannot race another call or a
 * Local choice; the Local conversion also checks the stored mode and the Accounts in the statement that
 * writes it (see `chooseMulti`). Getting back into a multi Instance with no Accounts is C42's. If
 * sign-up fails after the claim, the half-made Account is removed (never the Learner or its progress)
 * and the Instance is put back as it was: not set up, or Local when it was converted. If that cleanup
 * fails too, the error is logged and the Instance stays multi (closed).
 */
export async function createFirstAdmin(
	{ instance, auth, db }: { instance: Instance; auth: Auth; db: Db },
	input: FirstAdminInput
): Promise<{ headers: Headers }> {
	validate(input);
	return exclusively(async () => {
		// Before the claim, so an Instance that has Accounts but no stored mode (the state the reset command
		// repairs, C54) never gets a mode row that this call would take away again: a reset landing in
		// between would see the row, skip its restore, and be undone by the rollback below.
		if ((await db.user.count()) > 0) throw new InstanceAlreadySetUpError();
		const claim = await claimInstance(instance, input.convert === true);
		// Everything that can fail after the claim is inside the rollback. The Account is removed only if this
		// attempt's own sign-up started: an Account that appeared meanwhile, or a count that threw, leaves
		// every Account alone and only puts the Instance back.
		let signUpStarted = false;
		try {
			// Kept: an Account made between the check above and the claim still undoes the claim.
			if ((await db.user.count()) > 0) throw new InstanceAlreadySetUpError();
			signUpStarted = true;
			const { headers } = await runAsFirstAdmin(() =>
				auth.api.signUpEmail({
					body: { name: input.name.trim(), email: input.email, password: input.password },
					returnHeaders: true
				})
			);
			return { headers };
		} catch (error) {
			await rollback(claim, db, signUpStarted);
			throw error;
		}
	});
}

type Claim = { undo(): Promise<void> };

async function claimInstance(instance: Instance, convert: boolean): Promise<Claim> {
	// A stored mode is checked here, in the lock; a mode another process stored shows as the create's
	// unique violation, which `chooseMulti` turns into the same refusal (and re-reads the mode). A Local
	// Instance is claimed only by a caller that asked to convert it.
	const mode = instance.mode();
	if (mode !== null && !(convert && mode === 'local')) throw new InstanceAlreadySetUpError();
	return instance.chooseMulti();
}

async function rollback(claim: Claim, db: Db, removeAccount: boolean) {
	try {
		if (removeAccount) await db.user.deleteMany({ where: { learnerId: LOCAL_LEARNER_ID } });
		await claim.undo();
	} catch (cleanupError) {
		logFailure('createFirstAdmin: rollback failed, the Instance stays multi-user:', cleanupError);
	}
}
