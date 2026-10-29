import type { Actions, PageServerLoad } from './$types';
import { createAccept } from './accept';

const accept = createAccept();

export const load: PageServerLoad = accept.load;

export const actions: Actions = { default: accept.action };
