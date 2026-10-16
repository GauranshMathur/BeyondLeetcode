import { fail, redirect } from '@sveltejs/kit';
import { isAPIError } from 'better-auth/api';
import type { MultiUserChoice } from '$lib/server/app';
import { isNameTooLong, MAX_NAME_LENGTH } from '$lib/server/identity/auth';
import { forwardSetCookies } from '$lib/server/identity/auth-handler';
import { InvalidFirstAdminError, MultiUserNotAvailableError } from '$lib/server/identity/setup';
import { InstanceAlreadySetUpError } from '$lib/server/instance';
import type { Actions, PageServerLoad } from './$types';

/** Why Multi-user cannot be chosen here: what to add to `.env`. (`later` is never produced, see `MultiUserChoice`.) */
const unavailable = (choice: Exclude<MultiUserChoice, { kind: 'open' }>) =>
	choice.kind === 'needs-env' ? choice.message : 'Multi-user is not available on this server.';

/** The Instance module's refusal when someone set it up first (see instance.ts). */
const isAlreadySetUp = (error: unknown) =>
	error instanceof Error && error.message.includes('already set up');

/** Fixed texts only: an error's own message (Prisma's carry paths and query text) never reaches the form. */
const FIELD_MESSAGES = {
	name: 'Enter a name.',
	email: 'Enter a valid email address.',
	password: 'Use 12 to 128 characters.'
} as const;
const NAME_TOO_LONG = `Use at most ${MAX_NAME_LENGTH} characters.`;
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

export const load: PageServerLoad = ({ locals }) => ({ multiUser: locals.setup.multiUser });

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
			if (!isAlreadySetUp(error)) throw error;
		}
		redirect(303, '/');
	},

	/** Step 2: create the admin, sign them in, and land on the Map. */
	admin: async ({ request, locals, cookies }) => {
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
		// The gate also lets /setup?convert through on a Local Instance, which anyone can reach: only an
		// Instance that is not set up may make its first admin here (converting Local has its own card).
		if (locals.instance.mode() !== null) {
			return fail(409, adminStep(typed, { message: ALREADY_SET_UP }));
		}
		// Before the Instance is claimed, so a name over the cap leaves nothing to undo. Better Auth's hook
		// refuses it too (`NAME_TOO_LONG`), which is what the catch below maps if one ever gets this far.
		if (isNameTooLong(input.name)) {
			return fail(400, adminStep(typed, { field: 'name', message: NAME_TOO_LONG }));
		}
		let headers: Headers;
		try {
			({ headers } = await locals.setup.createFirstAdmin(input));
		} catch (error) {
			if (isAPIError(error) && error.body?.code === 'NAME_TOO_LONG') {
				return fail(400, adminStep(typed, { field: 'name', message: NAME_TOO_LONG }));
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
