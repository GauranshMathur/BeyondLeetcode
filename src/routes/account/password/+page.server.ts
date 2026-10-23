import { createThrottle } from '$lib/server/identity/throttle';
import type { Actions, PageServerLoad } from './$types';
import { createChangePassword } from './change-password';

// One counter for the whole process: the current-password tries of every user, by client address and Account.
// Its own instance, apart from Sign in's.
const changePassword = createChangePassword(createThrottle());

export const load: PageServerLoad = changePassword.load;

export const actions: Actions = { default: changePassword.action };
