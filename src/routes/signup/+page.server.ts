import { createThrottle } from '#lib/server/identity/throttle.js';
import type { Actions, PageServerLoad } from './$types';
import { createSignUp } from './sign-up';

// One counter for the whole process: the sign-up attempts of every visitor, by client address.
const signUp = createSignUp(createThrottle());

export const load: PageServerLoad = signUp.load;

export const actions: Actions = { default: signUp.action };
