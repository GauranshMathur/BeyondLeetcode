import { fail, redirect } from '@sveltejs/kit';
import { isAPIError } from 'better-auth/api';
import type { MultiUserChoice } from '#lib/server/app.js';
import {
	hasForbiddenNameCharacter,
	isNameTooLong,
	MAX_NAME_LENGTH
} from '#lib/server/identity/auth.js';
import { forwardSetCookies } from '#lib/server/identity/auth-handler.js';
import { InvalidFirstAdminError, MultiUserNotAvailableError } from '#lib/server/identity/setup.js';
import { AccountsExistError, InstanceAlreadySetUpError } from '#lib/server/instance.js';
import type { Actions, PageServerLoad } from './$types';

/** Why Multi-user cannot be chosen here: what to add to `.env`. (`later` is never produced, see `MultiUserChoice`.) */
const unavailable = (choice: Exclude<MultiUserChoice, { kind: 'open' }>) =>
	choice.kind === 'needs-env' ? choice.message : 'Multi-user is not available on this server.';

/** Fixed texts only: an error's own message (Prisma's carry paths and query text) never reaches the form. */
const FIELD_MESSAGES = {
	name: 'Enter a name.',
	email: 'Enter a valid email address.',
	password: 'Use 12 to 128 characters.'
} as const;
const NAME_TOO_LONG = `Use at most ${MAX_NAME_LENGTH} characters.`;
const NAME_CHARACTERS = "This name contains a character that can't be used.";
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
		// Before the Instance is claimed, so a name over the cap leaves nothing to undo. Better Auth's hook
		// refuses it too (`NAME_TOO_LONG`), which is what the catch below maps if one ever gets this far.
		if (isNameTooLong(input.name)) {
			return fail(400, adminStep(typed, { field: 'name', message: NAME_TOO_LONG }));
		}
		if (hasForbiddenNameCharacter(input.name)) {
			return fail(400, adminStep(typed, { field: 'name', message: NAME_CHARACTERS }));
		}
		let headers: Headers;
		try {
			({ headers } = await locals.setup.createFirstAdmin(
				converting ? { ...input, convert: true } : input
			));
		} catch (error) {
			if (isAPIError(error) && error.body?.code === 'NAME_TOO_LONG') {
				return fail(400, adminStep(typed, { field: 'name', message: NAME_TOO_LONG }));
			}
			if (isAPIError(error) && error.body?.code === 'NAME_INVALID_CHARACTERS') {
				return fail(400, adminStep(typed, { field: 'name', message: NAME_CHARACTERS }));
			}
			if (isAPIError(error) && error.body?.code === 'NAME_REQUIRED') {
				return fail(400, adminStep(typed, { field: 'name', message: FIELD_MESSAGES.name }));
			}
			if (error instanceof InvalidFirstAdminError) {
				return fail(
					400,
					adminStep(typed, { field: error.field, message: FIELD_MESSAGES[error.field] })
				);
			}
			if (error instanceof InstanceAlreadySetUpError) {
				return fail(409, adminStep(typed, { message: ALREADY_SET_UP }));
			}
			if (error instanceof MultiUserNotAvailableError) {
				return fail(
					400,
					adminStep(typed, { message: 'Multi-user is not available on this server.' })
				);
			}
			// Only the kind of failure is logged: the error text may hold paths, query text and hashes.
			console.error(
				'Setup: creating the admin failed:',
				error instanceof Error ? error.name : typeof error,
				(error as { code?: unknown })?.code
			);
			return fail(
				500,
				adminStep(typed, { message: 'The admin account could not be created. Try again.' })
			);
		}
		forwardSetCookies(cookies, headers.getSetCookie());
		redirect(303, '/');
	}
};
