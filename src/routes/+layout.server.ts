import type { LayoutServerLoad } from './$types';

// No identity before the Instance is set up: only /setup renders then, and it shows no name.
export const load: LayoutServerLoad = ({ locals }) => ({
	displayName: locals.identity?.displayName
});
