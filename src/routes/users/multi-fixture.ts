import { readdirSync, readFileSync } from 'node:fs';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from '../../../prisma/generated/client';
import type { Db } from '../../lib/server/db.ts';
import { createAuth } from '../../lib/server/identity/auth.ts';

// Test-only, and it adds no production code path. Browser tests of the Multi-user server (4174) that need
// Accounts the screens cannot make yet (a learner, a user whose role only contains admin) open the server's
// own database file from the test process, with a second Better Auth instance built from the server's own
// settings, and make the Accounts and sessions with that. The server then sees ordinary rows and ordinary
// signed cookies. Finding the file needs the server's environment, which only /proc has: a fixed path in
// playwright.config.ts would replace that (see the PR for C34a).

const MULTI_PORT = '4174';

/** What the Multi-user server was started with: the Playwright config puts a fresh temp database path in its environment. */
function serverEnvironment(): ServerTarget {
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

/** A Multi-user server's database file, signing secret and public origin: what a second Better Auth needs to act on it. */
export type ServerTarget = { database: string; secret: string; origin: string };

/**
 * Why the fixture opens its own client instead of `createDb`: libSQL's busy timeout defaults to 0, so a write
 * that meets another process's write lock fails at once with SQLITE_BUSY, which Prisma reports as P1008
 * ("Operation has timed out"). Four workers write to the one shared file (and the server writes to it too),
 * so this happened now and then. The client here waits up to BUSY_TIMEOUT_MS for a lock. That alone is not
 * enough: Prisma's libSQL adapter opens transactions as deferred (read first, then write), and SQLite refuses
 * a read-to-write upgrade at once, whatever the timeout, when another connection already holds the write
 * lock. Only running the whole transaction again helps, which is `retryWhenBusy` below. The app's own client
 * is not touched (production code is out of this card).
 */
const BUSY_TIMEOUT_MS = 10_000;

/** Prisma's "Operation has timed out" (SQLITE_BUSY), the only error the retry below absorbs. */
function isBusy(error: unknown): boolean {
	let current: unknown = error;
	for (let depth = 0; current && depth < 5; depth++) {
		const { code, cause } = current as { code?: unknown; cause?: unknown };
		if (code === 'P1008') return true;
		current = cause;
	}
	return false;
}

/**
 * Runs `operation` again (at most `attempts` times in all) when the database was busy during it, and only
 * then; any other error is thrown at once. Better Auth catches a failed insert and throws its own "Failed to
 * create user", so the busy error is not on what comes out. `busyCount` says whether one happened inside.
 */
export async function retryWhenBusy<T>(
	busyCount: () => number,
	operation: () => Promise<T>,
	attempts = 4
): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		const before = busyCount();
		try {
			return await operation();
		} catch (error) {
			const busy = isBusy(error) || busyCount() > before;
			if (attempt >= attempts || !busy) throw error;
			await new Promise((resolve) => setTimeout(resolve, 100 * attempt + Math.random() * 100));
		}
	}
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

/** The shared 4174 server's database, or another Multi-user server's when `target` names it. */
export async function openMultiUserDatabase(target: ServerTarget = serverEnvironment()) {
	const { database, secret, origin } = target;
	let busyHits = 0;
	const db = new PrismaClient({
		adapter: new PrismaLibSql({ url: database, timeout: BUSY_TIMEOUT_MS })
	}).$extends({
		query: {
			async $allOperations({ args, query }) {
				try {
					return await query(args);
				} catch (error) {
					if (isBusy(error)) busyHits++;
					throw error;
				}
			}
		}
	});
	const busyCount = () => busyHits;
	// Admits every sign-up: this instance is only ever driven from the test process, never over HTTP.
	const auth = createAuth({ db: db as unknown as Db, origin, secret, admitSignUp: () => ({}) });

	return {
		db,
		/** A new Account (a learner), or the one with this email from an earlier run of the same test. */
		async ensureLearner({ name, email }: { name: string; email: string }) {
			await retryWhenBusy(busyCount, async () => {
				if (!(await db.user.findUnique({ where: { email } }))) {
					await auth.api.signUpEmail({ body: { name, email, password: LEARNER_PASSWORD } });
				}
			});
		},
		/** A fresh session for an Account, as the cookie a browser would hold after signing in. */
		async signIn(email: string, password: string): Promise<Session> {
			const { headers } = await retryWhenBusy(busyCount, () =>
				auth.api.signInEmail({ body: { email, password }, returnHeaders: true })
			);
			return sessionOf(headers.getSetCookie());
		},
		close: () => db.$disconnect()
	};
}
