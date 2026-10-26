import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isRedirect } from '@sveltejs/kit';
import { expect, it, onTestFinished } from 'vitest';
import { createApp } from '#lib/server/app.js';
import { createHandle } from '#lib/server/handle.js';
import { createThrottle } from '#lib/server/identity/throttle.js';
import { actions as settingsActions } from '../settings/+page.server';
import { createSignIn } from './sign-in';

// The whole path a released Instance takes, with no test switch anywhere: Setup offers Multi-user, the first
// admin is created, signs out and signs back in through the Sign in action, and the hook sees who they are.

const secret = 'a-test-secret-of-at-least-thirty-two-characters';
const admin = { name: 'Ada', email: 'ada@example.com', password: 'correct horse battery' };

const cookieHeader = (setCookies: string[]) => setCookies.map((c) => c.split(';')[0]).join('; ');

it('a fresh Instance without the test switch: choose Multi-user, create the admin, sign out, sign back in', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'beyondleetcode-flow-'));
	onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
	const url = `file:${join(dir, 'app.db')}`;
	execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], {
		env: { ...process.env, DATABASE_URL: url },
		stdio: 'pipe'
	});
	// No IDENTITY_TEST_LEARNER and no scripted Runner: the environment of a released Instance.
	const app = await createApp({
		CONTENT_DIR: 'src/lib/server/content/fixture',
		DATABASE_URL: url,
		RUNNER_URL: 'http://127.0.0.1:1',
		RUNNER_TOKEN: 'test-token',
		BETTER_AUTH_SECRET: secret,
		ORIGIN: 'http://localhost:3000'
	});
	expect(app.setup.multiUser).toEqual({ kind: 'open' });

	// 1. Setup creates the admin and signs them in.
	const created = await app.setup.createFirstAdmin(admin);
	expect(app.instance.mode()).toBe('multi');
	const first = cookieHeader(created.headers.getSetCookie());

	// 2. The hook knows them; with no cookie it sends the visitor to Sign in.
	const handle = createHandle(app);
	const visit = async (path: string, routeId: string, cookie: string, method = 'GET') => {
		const resolved: unknown[] = [];
		const event = {
			url: new URL(path, 'http://localhost:3000'),
			route: { id: routeId },
			request: { method, headers: new Headers(cookie ? { cookie } : {}) },
			cookies: { get: () => undefined },
			locals: {} as Record<string, unknown>
		};
		const response = await handle({
			event: event as never,
			resolve: async (e) => {
				resolved.push(e);
				return new Response('page');
			}
		});
		return { response, locals: event.locals, rendered: resolved.length > 0 };
	};
	const signedIn = await visit('/', '/', first);
	expect(signedIn.rendered).toBe(true);
	expect(signedIn.locals.identity).toMatchObject({ displayName: 'Ada', role: 'admin' });
	const stranger = await visit('/topics/stacks', '/topics/[topicId]', '');
	expect(stranger.response.headers.get('location')).toBe('/signin?next=%2Ftopics%2Fstacks');

	// 3. Sign out: the Settings action, with their cookie.
	const jar = new Map<string, string>();
	const cookies = { set: (name: string, value: string) => void jar.set(name, value) };
	const outcome = async (run: () => unknown) => {
		try {
			return await run();
		} catch (thrown) {
			if (isRedirect(thrown)) return thrown;
			throw thrown;
		}
	};
	const out = await outcome(() =>
		settingsActions.signout({
			request: { headers: new Headers({ cookie: first }) },
			locals: { auth: app.multiUser?.auth },
			cookies
		} as never)
	);
	expect(out).toMatchObject({ status: 303, location: '/signin' });
	expect(jar.get('better-auth.session_token')).toBe('');
	// The cookie they had is nobody now.
	expect((await visit('/', '/', first)).response.headers.get('location')).toBe('/signin?next=%2F');

	// 4. Sign back in through the form, to the page they asked for.
	const signIn = createSignIn(createThrottle());
	jar.clear();
	const form = new FormData();
	form.set('email', admin.email);
	form.set('password', admin.password);
	const back = await outcome(() =>
		signIn.action({
			request: { formData: async () => form },
			locals: { auth: app.multiUser?.auth, instance: app.instance },
			cookies,
			url: new URL('http://localhost:3000/signin?next=%2Ftopics%2Fstacks'),
			getClientAddress: () => '203.0.113.7'
		} as never)
	);
	expect(back).toMatchObject({ status: 303, location: '/topics/stacks' });
	const second = [...jar].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('; ');
	const again = await visit('/topics/stacks', '/topics/[topicId]', second);
	expect(again.rendered).toBe(true);
	expect(again.locals.identity).toMatchObject({
		displayName: 'Ada',
		role: 'admin',
		learnerId: 'local'
	});
}, 60_000);
