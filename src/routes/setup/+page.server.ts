import { fail, redirect } from '@sveltejs/kit';
import type { MultiUserChoice } from '#lib/server/app.js';
import {
	ACCOUNT_LIMITS,
	type RefusalCode,
	refusalOf
} from '#lib/server/identity/account-actions.js';
import { forwardSetCookies } from '#lib/server/identity/auth-handler.js';
import { AccountsExistError, InstanceAlreadySetUpError } from '#lib/server/instance.js';
import { logFailure } from '#lib/server/logging.js';
import type { Actions, PageServerLoad } from './$types';

/** Why Multi-user cannot be chosen here: what to add to `.env`. */
const unavailable = (choice: Exclude<MultiUserChoice, { kind: 'open' }>) => choice.message;

/** Fixed texts only: an error's own message (Prisma's carry paths and query text) never reaches the form. */
const FIELD_MESSAGES = {
	name: 'Enter a name.',
	email: 'Enter a valid email address.',
	password: `Use ${ACCOUNT_LIMITS.passwordMin} to ${ACCOUNT_LIMITS.passwordMax} characters.`
} as const;
const NAME_TOO_LONG = `Use at most ${ACCOUNT_LIMITS.nameMax} characters.`;
const NAME_CHARACTERS = "This name contains a character that can't be used.";
type Problem = { field: keyof typeof FIELD_MESSAGES; message: string };
/**
 * What the first admin's form shows for each refusal code, as the field and Setup's own text. Every code is
 * listed, so a new one fails `bun run check` until it is given a text or `null` here. `null`: Setup has no
 * text for it (the form cannot meet it, or it is a failure), so it answers the generic failure.
 */
const REFUSAL_PROBLEMS: Record<RefusalCode, Problem | null> = {
	NAME_REQUIRED: { field: 'name', message: FIELD_MESSAGES.name },
	NAME_TOO_LONG: { field: 'name', message: NAME_TOO_LONG },
	NAME_INVALID_CHARACTERS: { field: 'name', message: NAME_CHARACTERS },
	INVALID_EMAIL: { field: 'email', message: FIELD_MESSAGES.email },
	PASSWORD_TOO_SHORT: { field: 'password', message: FIELD_MESSAGES.password },
	PASSWORD_TOO_LONG: { field: 'password', message: FIELD_MESSAGES.password },
	WRONG_SIGN_IN: null,
	SIGN_IN_FAILED: null,
	PROVIDER_REFUSED: null,
	SIGN_UP_FAILED: null,
	EMAIL_UNAVAILABLE: null,
	SIGN_UP_CLOSED: null,
	INVITE_INVALID: null,
	TOO_MANY_ATTEMPTS: null,
	WRONG_CURRENT_PASSWORD: null,
	PASSWORDS_DO_NOT_MATCH: null,
	NO_PASSWORD: null,
	SAME_PASSWORD: null,
	CHANGE_FAILED: null,
	CHANGE_UNENDED: null,
	NOT_SIGNED_IN: null,
	SIGN_OUT_FAILED: null,
	MUST_CHANGE_HOLD: null
};
const LOCAL_REFUSED = 'This instance already has accounts, so it cannot start in Local mode.';
const ALREADY_SET_UP = 'This instance has already been set up.';
const text = (data: FormData, key: string) => {
	const value = data.get(key);
	return typeof value === 'string' ? value : '';
};

/** The admin step's data, always the same keys so the page reads them without guessing. */
const adminStep = (
	typed: { name: string; email: string },
	problem?: { field?: keyof typeof FIELD_MESSAGES; message: string }
) => ({ step: 'admin' as const, ...typed, field: problem?.field, message: problem?.message });

/** `?convert` on a Local Instance (the gate lets only that through): the Settings row's way to the admin form. */
const isConverting = (locals: App.Locals, url: URL) =>
	locals.instance.mode() === 'local' && url.searchParams.has('convert');

export const load: PageServerLoad = ({ locals, url }) => ({
	multiUser: locals.setup.multiUser,
	converting: isConverting(locals, url)
});

export const actions: Actions = {
	/** Step 1: choose a mode. Local sets the Instance up; Multi-user goes on to the admin form. */
	mode: async ({ request, locals }) => {
		const mode = (await request.formData()).get('mode');
		if (mode === 'multi') {
			const { multiUser } = locals.setup;
			if (multiUser.kind === 'open') return adminStep({ name: '', email: '' });
			return fail(400, { message: unavailable(multiUser) });
		}
		if (mode !== 'local') return fail(400, { message: 'Choose a mode to continue.' });
		try {
			await locals.instance.chooseLocal();
		} catch (error) {
			// A second choice that lost the race goes to the Map like the first; any other failure is real.
			if (error instanceof AccountsExistError) return fail(409, { message: LOCAL_REFUSED });
			if (!(error instanceof InstanceAlreadySetUpError)) throw error;
		}
		redirect(303, '/');
	},

	/** Step 2: create the admin, sign them in, and land on the Map. */
	admin: async ({ request, locals, cookies, url }) => {
		const data = await request.formData();
		const input = {
			name: text(data, 'name'),
			email: text(data, 'email'),
			password: text(data, 'password')
		};
		// What was typed comes back, except the password.
		const typed = { name: input.name, email: input.email };

		const { multiUser } = locals.setup;
		if (multiUser.kind !== 'open') {
			return fail(400, { message: unavailable(multiUser) });
		}
		// A Local Instance has no sign-in, so anyone who can reach it reaches this action: it converts only when
		// the request says so (`?convert`, which the gate admits on Local only) and the Instance is Local.
		// A multi Instance is refused here, and `createFirstAdmin` checks again against the stored mode.
		const converting = isConverting(locals, url);
		const mode = locals.instance.mode();
		if (mode === 'multi' || (mode === 'local' && !converting)) {
			return fail(409, adminStep(typed, { message: ALREADY_SET_UP }));
		}
		let headers: Headers;
		try {
			({ headers } = await locals.setup.createFirstAdmin(
				converting ? { ...input, convert: true } : input
			));
		} catch (error) {
			const refusal = refusalOf(error);
			const problem = refusal && REFUSAL_PROBLEMS[refusal.refused];
			if (problem) return fail(400, adminStep(typed, problem));
			if (error instanceof InstanceAlreadySetUpError) {
				return fail(409, adminStep(typed, { message: ALREADY_SET_UP }));
			}
			logFailure('Setup: creating the admin failed:', error);
			return fail(
				500,
				adminStep(typed, { message: 'The admin account could not be created. Try again.' })
			);
		}
		forwardSetCookies(cookies, headers.getSetCookie());
		redirect(303, '/');
	}
};
