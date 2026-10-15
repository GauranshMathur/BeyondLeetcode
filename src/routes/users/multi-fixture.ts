import { readdirSync, readFileSync } from 'node:fs';
import { createDb } from '../../lib/server/db.ts';
import { createAuth } from '../../lib/server/identity/auth.ts';

// Test-only. Browser tests of the Multi-user server (4174) that need Accounts the screens cannot make yet:
// a learner, a user whose role only contains admin. It never touches production code paths: it opens the
// server's own database file next to the running server, with a second Better Auth instance built from
// the server's own settings, and it makes the Accounts and sessions with that. The server then sees
// ordinary rows and ordinary signed cookies.

const MULTI_PORT = '4174';

/** What the Multi-user server was started with: the Playwright config puts a fresh temp database path in its environment. */
function serverEnvironment() {
	// Linux: `/proc/<pid>/environ` is the environment a process started with. The server is the process
	// started with PORT=4174 (the shell that runs it has no PORT of its own).
	for (const pid of readdirSync('/proc').filter((name) => /^\d+$/.test(name))) {
		let raw: string;
		try {
			raw = readFileSync(`/proc/${pid}/environ`, 'utf8');
		} catch {
			continue;
		}
		const env = new Map<string, string>();
		for (const line of raw.split('\0')) {
			const eq = line.indexOf('=');
			if (eq > 0) env.set(line.slice(0, eq), line.slice(eq + 1));
		}
		const database = env.get('DATABASE_URL');
		const secret = env.get('BETTER_AUTH_SECRET');
		const origin = env.get('ORIGIN');
		if (env.get('PORT') === MULTI_PORT && database && secret && origin) {
			return { database, secret, origin };
		}
	}
	throw new Error(
		`Could not find the Multi-user test server (PORT=${MULTI_PORT}) to open its database. These tests read it from /proc, so they run on Linux only.`
	);
}

export const LEARNER_PASSWORD = 'correct horse battery staple';

/** The `Set-Cookie` lines of a sign-in as Playwright `storageState`: this browser context is that user. */
function sessionOf(setCookies: string[]) {
	return {
		cookies: setCookies.map((line) => {
			const [pair] = line.split(';');
			const eq = pair.indexOf('=');
			return {
				name: pair.slice(0, eq),
				// As sent: Better Auth URL-encodes the signed token, and the browser sends it back as it is.
				value: pair.slice(eq + 1),
				domain: 'localhost',
				path: '/',
				expires: -1,
				httpOnly: true,
				secure: false,
				sameSite: 'Lax' as const
			};
		}),
		origins: []
	};
}

export type Session = ReturnType<typeof sessionOf>;

export async function openMultiUserDatabase() {
	const { database, secret, origin } = serverEnvironment();
	const db = createDb(database);
	// Admits every sign-up: this instance is only ever driven from the test process, never over HTTP.
	const auth = createAuth({ db, origin, secret, admitSignUp: () => ({}) });

	return {
		db,
		/** A new Account (a learner), or the one with this email from an earlier run of the same test. */
		async ensureLearner({ name, email }: { name: string; email: string }) {
			if (!(await db.user.findUnique({ where: { email } }))) {
				await auth.api.signUpEmail({ body: { name, email, password: LEARNER_PASSWORD } });
			}
		},
		/** A fresh session for an Account, as the cookie a browser would hold after signing in. */
		async signIn(email: string, password: string): Promise<Session> {
			const { headers } = await auth.api.signInEmail({
				body: { email, password },
				returnHeaders: true
			});
			return sessionOf(headers.getSetCookie());
		},
		close: () => db.$disconnect()
	};
}
