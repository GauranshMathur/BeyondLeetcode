import type { Auth } from './auth.ts';

/** Better Auth's password Account: providerId `credential`, accountId the user id. */
export const PASSWORD_PROVIDER_ID = 'credential';

/** The `where` that finds a user's password Account. */
export function passwordAccountWhere(userId: string) {
	return { userId, providerId: PASSWORD_PROVIDER_ID, accountId: userId };
}

/** A stored role as the app sees it: `admin` exactly, anything else a learner. */
export function roleOf(stored: string | null | undefined): 'admin' | 'learner' {
	return stored === 'admin' ? 'admin' : 'learner';
}

/** An email as Better Auth looks it up: lowercased, not trimmed. */
export function emailKey(email: string): string {
	return email.toLowerCase();
}

export type CurrentSession = {
	userId: string;
	identity: { learnerId: string; displayName: string; role: 'admin' | 'learner' };
	mustChangePassword: boolean;
	/** Set-Cookie headers of an extended session, to send back. */
	refreshedCookies: string[];
};

/**
 * The session these headers name, with every session rule applied: Better Auth's /get-session hook
 * drops a session whose credential generation is stale; no session, a banned user or an Account
 * without a Learner is null. The session is read from the database on every call.
 */
export async function currentSession(auth: Auth, headers: Headers): Promise<CurrentSession | null> {
	// `returnHeaders`: an active session is extended and its new cookie comes back as a header.
	const { headers: out, response: session } = await auth.api.getSession({
		headers,
		returnHeaders: true
	});
	const user = session?.user;
	if (!user?.learnerId || user.banned) return null;
	return {
		userId: user.id,
		identity: { learnerId: user.learnerId, displayName: user.name, role: roleOf(user.role) },
		mustChangePassword: user.mustChangePassword ?? false,
		refreshedCookies: out.getSetCookie()
	};
}
