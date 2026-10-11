import { AsyncLocalStorage } from 'node:async_hooks';
import type { Db } from '../db.ts';
import type { Instance } from '../instance.ts';
import { type Auth, MIN_PASSWORD_LENGTH } from './auth.ts';

/** The Local Learner's id: the first admin takes it over, so Local progress stays theirs. */
export const FIRST_ADMIN_LEARNER_ID = 'local';

const firstAdmin = new AsyncLocalStorage<true>();

/** Runs `fn` as the first-admin sign-up; `registration.ts` admits only calls made inside it. */
export const runAsFirstAdmin = <T>(fn: () => Promise<T>): Promise<T> => firstAdmin.run(true, fn);

/** True only inside `runAsFirstAdmin`; nothing in a request can set it. */
export const isFirstAdmin = (): boolean => firstAdmin.getStore() === true;

export interface FirstAdminInput {
	name: string;
	email: string;
	password: string;
}

/**
 * Claims the Instance as multi-user and signs the first admin up, who owns the `local` Learner
 * (so Local progress carries over). Returns the sign-up response's headers: their `Set-Cookie`
 * signs the admin in. If sign-up fails after the claim, the half-made Account is removed (never the
 * Learner or its progress) and the Instance is put back as it was, so Setup can be retried.
 */
export async function createFirstAdmin(
	{ instance, auth, db }: { instance: Instance; auth: Auth; db: Db },
	{ name, email, password }: FirstAdminInput
): Promise<{ headers: Headers }> {
	if (password.length < MIN_PASSWORD_LENGTH) {
		throw new Error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
	}
	const claim = await instance.chooseMulti();
	try {
		const { headers } = await runAsFirstAdmin(() =>
			auth.api.signUpEmail({ body: { name, email, password }, returnHeaders: true })
		);
		return { headers };
	} catch (error) {
		// Sign-up is not one transaction: the user row can exist when a later step fails.
		await db.user.deleteMany({ where: { learnerId: FIRST_ADMIN_LEARNER_ID } });
		await claim.undo();
		throw error;
	}
}
