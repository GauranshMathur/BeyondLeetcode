import { createThrottle } from '#lib/server/identity/throttle.js';
import type { Actions, PageServerLoad } from './$types';
import { createAccept } from './accept';

// One counter for the whole process: the accept attempts of every visitor, by client address. Its own
// instance, so Sign up and Accept invite never share a budget.
const accept = createAccept(createThrottle());

export const load: PageServerLoad = accept.load;

export const actions: Actions = { default: accept.action };
