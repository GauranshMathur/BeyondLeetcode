import { createThrottle } from '$lib/server/identity/throttle';
import type { Actions, PageServerLoad } from './$types';
import { createSignIn } from './sign-in';

// One counter for the whole process: the sign-in attempts of every visitor, by client address and Account.
// Its own instance, so Sign up (which counts successes too) and Sign in never share a budget.
const signIn = createSignIn(createThrottle());

export const load: PageServerLoad = signIn.load;

export const actions: Actions = { default: signIn.action };
