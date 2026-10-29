import type { Actions, PageServerLoad } from './$types';
import { createSignUp } from './sign-up';

const signUp = createSignUp();

export const load: PageServerLoad = signUp.load;

export const actions: Actions = { default: signUp.action };
