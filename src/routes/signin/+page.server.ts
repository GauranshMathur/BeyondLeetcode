import { createThrottle, providerStarts } from '#lib/server/identity/throttle.js';
import type { Actions, PageServerLoad } from './$types';
import { createSignIn } from './sign-in';

// One counter for the whole process: the sign-in attempts of every visitor, by client address and Account.
// The provider starts are the process's one set (`throttle.ts`), which the auth callback shares to give a start back.
// Its own instance, so Sign up (which counts successes too) and Sign in never share a budget.
const signIn = createSignIn(createThrottle(), providerStarts);

export const load: PageServerLoad = signIn.load;

export const actions: Actions = { default: signIn.action };
