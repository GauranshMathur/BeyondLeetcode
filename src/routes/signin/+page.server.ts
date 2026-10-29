import type { Actions, PageServerLoad } from './$types';
import { createSignIn } from './sign-in';

// The limits and the sign-in itself are the Instance's account actions (`locals.multiUser.accounts`), which
// every request shares; this page only reads the form and shows the refusals.
const signIn = createSignIn();

export const load: PageServerLoad = signIn.load;

export const actions: Actions = { default: signIn.action };
