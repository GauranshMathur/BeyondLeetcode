import type { Actions, PageServerLoad } from './$types';
import { createChangePassword } from './change-password';

// The current-password tries of every user are counted by the account actions, once for the whole process.
const changePassword = createChangePassword();

export const load: PageServerLoad = changePassword.load;

export const actions: Actions = { default: changePassword.action };
