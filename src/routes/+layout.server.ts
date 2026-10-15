import type { LayoutServerLoad } from './$types';

// No identity before the Instance is set up: only /setup renders then, and it shows no name.
export const load: LayoutServerLoad = ({ locals }) => ({
	displayName: locals.identity?.displayName,
	// Only the admin of a Multi-user Instance has Accounts to manage. The Local Learner is an admin
	// too, but Local Mode has no Accounts and no Users page.
	showUsers: locals.instance.mode() === 'multi' && locals.identity?.role === 'admin'
});
