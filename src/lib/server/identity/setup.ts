import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import type { Db } from '../db.ts';
import type { Instance } from '../instance.ts';
import { InstanceAlreadySetUpError } from '../instance.ts';
import { type Auth, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './auth.ts';

/** The Local Learner's id: the first admin takes it over, so Local progress stays theirs. */
export const FIRST_ADMIN_LEARNER_ID = 'local';

const firstAdmin = new AsyncLocalStorage<true>();

/** Runs `fn` as the first-admin sign-up; `registration.ts` admits only calls made inside it. */
const runAsFirstAdmin = <T>(fn: () => Promise<T>): Promise<T> => firstAdmin.run(true, fn);

/** True only inside `runAsFirstAdmin`; nothing in a request can set it. */
export const isFirstAdmin = (): boolean => firstAdmin.getStore() === true;

export interface FirstAdminInput {
	name: string;
	email: string;
	password: string;
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
		readonly field: keyof FirstAdminInput,
		message: string
	) {
		super(message);
		this.name = 'InvalidFirstAdminError';
	}
}

function validate({ name, email, password }: FirstAdminInput) {
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
 * Only an Instance with no stored mode can be claimed: one that is Local or multi (with Accounts or
 * without), or that has any Account, is refused (InstanceAlreadySetUpError). The check is made inside
 * the lock, so it cannot race another call or a Local choice. Converting a Local Instance is another
 * card's job (C39), and getting back into a multi Instance with no Accounts is C42's. If sign-up fails
 * after the claim, the half-made Account is removed (never the Learner or its progress) and the
 * Instance is put back to not set up. If that cleanup fails too, the error is logged and the Instance
 * stays multi (closed).
 */
export async function createFirstAdmin(
	{ instance, auth, db }: { instance: Instance; auth: Auth; db: Db },
	input: FirstAdminInput
): Promise<{ headers: Headers }> {
	validate(input);
	return exclusively(async () => {
		const claim = await claimInstance(instance);
		if ((await db.user.count()) > 0) {
			await rollback(claim, db, false);
			throw new InstanceAlreadySetUpError();
		}
		try {
			const { headers } = await runAsFirstAdmin(() =>
				auth.api.signUpEmail({
					body: { name: input.name.trim(), email: input.email, password: input.password },
					returnHeaders: true
				})
			);
			return { headers };
		} catch (error) {
			await rollback(claim, db, true);
			throw error;
		}
	});
}

type Claim = { undo(): Promise<void> };

async function claimInstance(instance: Instance): Promise<Claim> {
	// A stored mode is checked here, in the lock; a mode another process stored shows as the create's
	// unique violation, which `chooseMulti` turns into the same refusal (and re-reads the mode).
	if (instance.mode() !== null) throw new InstanceAlreadySetUpError();
	return instance.chooseMulti();
}

async function rollback(claim: Claim, db: Db, removeAccount: boolean) {
	try {
		if (removeAccount) await db.user.deleteMany({ where: { learnerId: FIRST_ADMIN_LEARNER_ID } });
		await claim.undo();
	} catch (cleanupError) {
		console.error('createFirstAdmin: rollback failed, the Instance stays multi-user', cleanupError);
	}
}
