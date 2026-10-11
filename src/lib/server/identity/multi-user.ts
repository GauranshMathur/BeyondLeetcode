import type { Auth } from './auth.ts';
import type { IdentityResolver } from './index.ts';

/**
 * Multi-user adapter: a request is the Account its session cookie names. The session is read from
 * the database on every request (no cookie cache), so a revoked session or removed user loses
 * access at once. No cookie, a forged one, a banned user or an Account without a Learner is nobody.
 */
export function createMultiUserIdentity(auth: Auth): IdentityResolver {
	return {
		resolve: async ({ request }) => {
			const session = await auth.api.getSession({ headers: request.headers });
			const user = session?.user;
			if (!user?.learnerId || user.banned) return null;
			return {
				learnerId: user.learnerId,
				displayName: user.name,
				role: user.role === 'admin' ? 'admin' : 'learner',
				mustChangePassword: user.mustChangePassword ?? false
			};
		}
	};
}
