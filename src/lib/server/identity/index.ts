import { TEST_LEARNER_COOKIE } from '../../e2e-learner.ts';
import type { Db } from '../db.ts';

export type Role = 'admin' | 'learner';

/** Who a request is: the Learner it acts for, the name the nav shows, and what they may do. */
export interface Identity {
	learnerId: string;
	displayName: string;
	role: Role;
}

/** What an adapter may read of a request: SvelteKit's `RequestEvent` satisfies it, and tests need no SvelteKit. */
export interface ResolveEvent {
	cookies: { get(name: string): string | undefined };
	request: { headers: Headers };
}

/** The seam: given a request, who is it? `null` means nobody. */
export interface IdentityResolver {
	/** `mustChangePassword` is set by the Multi-user adapter; the gate takes it as its own input. */
	resolve(event: ResolveEvent): Promise<(Identity & { mustChangePassword?: boolean }) | null>;
}

/** The Local Learner's fixed id: one row per Instance, so concurrent first requests cannot make two. */
const LOCAL_LEARNER_ID = 'local';

const TEST_LEARNER_ID = /^[a-z0-9-]{1,64}$/;

/**
 * Local Mode adapter: every request is the Local Learner, created on first use.
 * `testLearnerCookie` is the gate (off by default; only the e2e web server turns it on):
 * when on, a well-formed TEST_LEARNER_COOKIE makes the request that other Learner.
 */
export async function createLocalIdentity(
	db: Db,
	options: { testLearnerCookie?: boolean } = {}
): Promise<IdentityResolver> {
	await db.learner.upsert({
		where: { id: LOCAL_LEARNER_ID },
		update: {},
		create: { id: LOCAL_LEARNER_ID }
	});
	return {
		resolve: async ({ cookies }) => {
			const asked = options.testLearnerCookie ? cookies.get(TEST_LEARNER_COOKIE) : undefined;
			if (asked && TEST_LEARNER_ID.test(asked)) {
				return { learnerId: asked, displayName: 'Local', role: 'learner' };
			}
			return { learnerId: LOCAL_LEARNER_ID, displayName: 'Local', role: 'admin' };
		}
	};
}
