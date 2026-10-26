import { expect, it } from 'vitest';
import { signedIn } from './signed-in';

const locals = {} as App.Locals;

it('fails loudly when nobody is resolved', () => {
	expect(() => signedIn(locals)).toThrow('nobody resolved');
});

it('returns the Identity and the Learning core of the request', () => {
	const identity = { learnerId: 'l1', displayName: 'Ada', role: 'admin' } as const;
	const learning = {} as App.Locals['learning'];
	expect(signedIn({ identity, learning })).toEqual({ identity, learning });
});

// Held by `bun run check`, not by running: a public route that reads `locals.learning` directly must
// not compile, because it is unset on Sign in, Sign up and Accept invite.
it.skip('does not compile when a route reads locals without signedIn', () => {
	const l = {} as App.Locals;
	// @ts-expect-error `learning` is optional: read it through `signedIn`
	l.learning.map();
	// @ts-expect-error `identity` is optional: read it through `signedIn`
	return l.identity.role;
});
