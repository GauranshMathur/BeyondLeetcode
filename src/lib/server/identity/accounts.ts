import { APIError } from 'better-auth/api';
import type { Auth } from './auth.ts';
import type { Identity, Role } from './index.ts';

/** One Account as the Users page draws it. Nothing else of the user row leaves this module. */
export interface AccountRow {
	/** Better Auth's user id: what the row actions (reset password, remove) will name. */
	id: string;
	name: string;
	email: string;
	role: Role;
	/** When the Account was created, an ISO 8601 timestamp. */
	joined: string;
	/** This is the Account asking. */
	you: boolean;
}

/** The asker is not an admin (to Identity, which is the check that counts), or the plugin refused them. */
export class NotAdminError extends Error {
	constructor() {
		super('Only the admin may manage Accounts.');
		this.name = 'NotAdminError';
	}
}

/** The admin plugin returns at most this many users unless asked for more; the list is read in pages. */
const PAGE_SIZE = 100;

/**
 * Every Account, oldest first, for the admin. `who` is what Identity made of this request and
 * `headers` carry its session cookie, which the plugin reads again for its own check.
 *
 * Identity's role is the check that counts: it is `admin` exactly. The plugin's check alone is not
 * enough, because it splits a stored role on commas, so `admin,learner` passes it while the app
 * treats that user as a learner. A learner is refused before anything is read.
 */
export async function listAccounts(
	auth: Auth,
	{ who, headers }: { who: Identity; headers: Headers }
): Promise<AccountRow[]> {
	if (who.role !== 'admin') throw new NotAdminError();

	// By id: a page boundary that moves while Accounts come and go must never show a row twice.
	const rows = new Map<string, AccountRow>();
	let total = Number.POSITIVE_INFINITY;
	for (let offset = 0; rows.size < total; offset += PAGE_SIZE) {
		const page = await readPage(auth, headers, offset);
		// An admin always exists, so no users at all is the plugin's reply to a failed read (it swallows
		// database errors into an empty list), never an empty Instance.
		if (page.users.length === 0 && offset === 0) throw new Error('The Accounts could not be read.');
		if (page.users.length === 0) break;
		for (const user of page.users) {
			rows.set(user.id, {
				id: user.id,
				name: user.name,
				email: user.email,
				// The same rule as the Multi-user adapter: admin exactly, anything else is a learner.
				role: user.role === 'admin' ? 'admin' : 'learner',
				joined: new Date(user.createdAt).toISOString(),
				you: (user as { learnerId?: string | null }).learnerId === who.learnerId
			});
		}
		total = page.total;
	}
	return [...rows.values()];
}

async function readPage(auth: Auth, headers: Headers, offset: number) {
	try {
		return await auth.api.listUsers({
			headers,
			query: { limit: PAGE_SIZE, offset, sortBy: 'createdAt', sortDirection: 'asc' }
		});
	} catch (error) {
		// No session, or not an admin to the plugin: the same refusal as Identity's.
		if (error instanceof APIError && (error.statusCode === 401 || error.statusCode === 403)) {
			throw new NotAdminError();
		}
		throw error;
	}
}
