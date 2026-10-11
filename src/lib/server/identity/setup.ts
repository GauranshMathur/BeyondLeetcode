import { AsyncLocalStorage } from 'node:async_hooks';
import type { Instance } from '../instance.ts';
import { type Auth, MIN_PASSWORD_LENGTH } from './auth.ts';

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
 * signs the admin in. If sign-up fails after the claim, the Instance is put back as it was.
 */
export async function createFirstAdmin(
	{ instance, auth }: { instance: Instance; auth: Auth },
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
		await claim.undo();
		throw error;
	}
}
