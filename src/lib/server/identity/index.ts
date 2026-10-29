import { TEST_LEARNER_COOKIE } from '../../e2e-learner.ts';
import type { Db } from '../db.ts';
import type { Instance } from '../instance.ts';

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
	/**
	 * `mustChangePassword` is set by the Multi-user adapter; the gate takes it as its own input.
	 * `refreshedCookies` are `Set-Cookie` values for the response (an extended session); the hook sends them.
	 */
	resolve(
		event: ResolveEvent
	): Promise<(Identity & { mustChangePassword?: boolean; refreshedCookies?: string[] }) | null>;
}

/** The Local Learner's id: the first admin takes it over, so Local progress stays theirs (ADR 0006). One row per Instance, so concurrent first requests cannot make two. */
export const LOCAL_LEARNER_ID = 'local';

const TEST_LEARNER_ID = /^[a-z0-9-]{1,64}$/;

/** The Local Mode adapter, plus the one step that creates its Learner. */
export interface LocalIdentity extends IdentityResolver {
	/** Creates the Local Learner row if missing. Called once the Instance mode is Local, never before. */
	ensureLocalLearner(): Promise<void>;
}

/**
 * Local Mode adapter: every request is the Local Learner. Its row is not created here: a fresh,
 * not-yet-set-up Instance must stay empty, so the caller runs `ensureLocalLearner` once the mode is Local.
 * `testLearnerCookie` is the gate (off by default; only the e2e web server turns it on):
 * when on, a well-formed TEST_LEARNER_COOKIE makes the request that other Learner.
 */
export async function createLocalIdentity(
	db: Db,
	options: { testLearnerCookie?: boolean } = {}
): Promise<LocalIdentity> {
	return {
		ensureLocalLearner: async () => {
			await db.learner.upsert({
				where: { id: LOCAL_LEARNER_ID },
				update: {},
				create: { id: LOCAL_LEARNER_ID }
			});
		},
		resolve: async ({ cookies }) => {
			const asked = options.testLearnerCookie ? cookies.get(TEST_LEARNER_COOKIE) : undefined;
			if (asked && TEST_LEARNER_ID.test(asked)) {
				// The database refuses progress for a Learner with no row (C56), so the e2e Learner gets one.
				await db.learner.upsert({ where: { id: asked }, update: {}, create: { id: asked } });
				return { learnerId: asked, displayName: 'Local', role: 'learner' };
			}
			return { learnerId: LOCAL_LEARNER_ID, displayName: 'Local', role: 'admin' };
		}
	};
}

/** What the hook learns about a request, in every mode. */
export type IdentityAnswer =
	/** A Multi-user Instance with no adapter: the hook answers 503. */
	| { kind: 'unavailable' }
	| {
			kind: 'resolved';
			/** `null` means nobody: before Setup, or a Multi-user request with no valid session. */
			who: Identity | null;
			mustChangePassword: boolean;
			/** `Set-Cookie` values for the response (an extended session). */
			refreshedCookies: string[];
	  };

/** The one Identity the hook asks, once per request. */
export interface InstanceIdentity {
	resolve(event: ResolveEvent): Promise<IdentityAnswer>;
}

/**
 * Reads the Instance mode and asks only the adapter it names: nobody before Setup, `local` in Local
 * Mode (the Multi-user adapter, and the Local adapter's test cookie, are never consulted in the other),
 * `multi` in Multi-user Mode. `multi` is null when the Instance has no Better Auth.
 */
export function createIdentity({
	instance,
	local,
	multi
}: {
	instance: Pick<Instance, 'mode'>;
	local: IdentityResolver;
	multi: IdentityResolver | null;
}): InstanceIdentity {
	return {
		resolve: async (event) => {
			const mode = instance.mode();
			if (mode === 'multi' && !multi) return { kind: 'unavailable' };
			const adapter = mode === 'local' ? local : mode === 'multi' ? multi : null;
			const found = adapter ? await adapter.resolve(event) : null;
			if (!found)
				return { kind: 'resolved', who: null, mustChangePassword: false, refreshedCookies: [] };
			const { mustChangePassword, refreshedCookies, ...who } = found;
			return {
				kind: 'resolved',
				who,
				mustChangePassword: mustChangePassword ?? false,
				refreshedCookies: refreshedCookies ?? []
			};
		}
	};
}
