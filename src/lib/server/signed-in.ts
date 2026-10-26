import type { Identity } from '$lib/server/identity';
import type { Learner } from '$lib/server/learning/core';

/**
 * Who a signed-in route acts for. `handle.ts` leaves `locals.identity` and `locals.learning` unset
 * where nobody is resolved (/setup before Setup, and the public pages of a multi-user Instance), so
 * the types make them optional and a route that needs them reads them here. The gate keeps a
 * signed-out visitor away from those routes; this fails loudly, as a 500, if one gets through anyway.
 */
export function signedIn(locals: Pick<App.Locals, 'identity' | 'learning'>): {
	identity: Identity;
	learning: Learner;
} {
	const { identity, learning } = locals;
	if (!identity || !learning) throw new Error('A signed-in route ran with nobody resolved');
	return { identity, learning };
}
