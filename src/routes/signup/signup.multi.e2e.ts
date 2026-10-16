import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as base, expect } from '@playwright/test';

// Two kinds of server, because the Multi-user server on 4174 starts invite-only (as every new Instance does)
// and the Users page's toggle (C34b) can open registration, but a test that flipped it would change the
// shared server for every other file:
//   - the 4174 server itself shows the closed state;
//   - for the open state this file starts its own server from the same build, on a fresh database and a free
//     port, whose Instance a fixture made Multi-user and Open (seed-open-instance.ts), the state the toggle
//     leaves behind. The seed is a test fixture only: nothing in the app imports it.

const LEARNER = {
	name: 'Grace Hopper',
	email: 'grace@example.com',
	password: 'a long enough secret'
};

type OpenServer = { url: string };

const test = base.extend<object, { open: OpenServer }>({
	open: [
		// biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures this one needs from this pattern
		async ({}, use) => {
			const dir = mkdtempSync(join(tmpdir(), 'beyondleetcode-signup-'));
			const databaseUrl = `file:${join(dir, 'open.db')}`;
			const port = await freePort();
			const url = `http://localhost:${port}`;
			const env: NodeJS.ProcessEnv = {
				...process.env,
				DATABASE_URL: databaseUrl,
				CONTENT_DIR: 'src/lib/server/content/fixture',
				ORIGIN: url,
				PORT: String(port),
				BETTER_AUTH_SECRET: 'e2e-only-secret-e2e-only-secret-e2e-only-0123',
				// A multi-user Instance never takes the test switches; the Runner is never called by these pages.
				RUNNER_URL: 'http://127.0.0.1:9',
				RUNNER_TOKEN: 'e2e-unused'
			};
			delete env.IDENTITY_TEST_LEARNER;
			delete env.RUNNER_ADAPTER;

			execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], { env, stdio: 'pipe' });
			execFileSync('bun', ['src/routes/signup/seed-open-instance.ts', databaseUrl], {
				env,
				stdio: 'pipe'
			});
			const server = spawn('bun', ['./build/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
			let output = '';
			server.stdout?.on('data', (chunk) => {
				output += chunk;
			});
			server.stderr?.on('data', (chunk) => {
				output += chunk;
			});
			try {
				await ready(server, `${url}/signup`, () => output);
				await use({ url });
			} finally {
				await stop(server);
				rmSync(dir, { recursive: true, force: true });
			}
		},
		{ scope: 'worker', timeout: 60_000 }
	]
});

async function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = createServer();
		probe.once('error', reject);
		probe.listen(0, '127.0.0.1', () => {
			const { port } = probe.address() as { port: number };
			probe.close(() => resolve(port));
		});
	});
}

async function ready(server: ChildProcess, url: string, output: () => string) {
	const stopped = () => server.exitCode !== null || server.signalCode !== null;
	for (let i = 0; i < 150; i++) {
		if (stopped()) throw new Error(`the open-registration server exited:\n${output()}`);
		try {
			if ((await fetch(url)).ok) return;
		} catch {
			// not listening yet
		}
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	throw new Error(`the open-registration server did not answer in time:\n${output()}`);
}

async function stop(server: ChildProcess) {
	if (server.exitCode !== null || server.signalCode !== null) return;
	const exited = new Promise((resolve) => server.once('exit', resolve));
	server.kill('SIGTERM');
	const timedOut = Symbol('timeout');
	const result = await Promise.race([
		exited,
		new Promise((resolve) => setTimeout(() => resolve(timedOut), 5_000))
	]);
	if (result === timedOut) server.kill('SIGKILL');
}

test.describe('registration closed (the Multi-user server starts invite-only)', () => {
	test('shows the closed state and no form', async ({ page }) => {
		await page.goto('/signup');

		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign-up is closed.');
		await expect(
			page.getByText('This instance is invite-only. Ask your admin for an invite.')
		).toBeVisible();
		await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute(
			'href',
			'/signin'
		);
		await expect(
			page.getByText("Have an invite link? Open it from your admin's message.")
		).toBeVisible();
		await expect(page.getByLabel('Password')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Create account →' })).toHaveCount(0);
	});

	test('a posted form is refused while registration is closed', async ({ request }) => {
		const origin = 'http://localhost:4174';

		// A browser asks for HTML; without it SvelteKit answers a form post with JSON and status 200.
		const response = await request.post('/signup', {
			headers: { origin, accept: 'text/html' },
			form: { name: LEARNER.name, email: LEARNER.email, password: LEARNER.password }
		});

		expect(response.status()).toBe(403);
		expect(await response.text()).toContain('Sign-up is closed.');
	});
});

test.describe('registration open', () => {
	test.describe.configure({ mode: 'serial' });

	test('a visitor creates an Account and sees an empty Map, signed in', async ({
		browser,
		open
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();
		await page.goto(`${open.url}/signup`);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Start reading.');

		await page.getByLabel('Name').fill(LEARNER.name);
		await page.getByLabel('Email').fill(LEARNER.email);
		await page.getByLabel('Password').fill(LEARNER.password);
		await page.getByRole('button', { name: 'Create account →' }).click();

		await expect(page).toHaveURL(`${open.url}/`);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			'Every topic, in the order it builds.'
		);
		await expect(page.getByRole('navigation', { name: 'Primary' })).toContainText(LEARNER.name);
		// Nothing started, solved or complete: no current topic, only the first one open with nothing solved.
		await expect(page.getByText('Current topic')).toHaveCount(0);
		await expect(
			page.getByRole('link', { name: /unlocked, 0 of \d+ core problems solved/ })
		).toBeVisible();
		await expect(page.getByRole('link', { name: /complete/i })).toHaveCount(0);

		// Signed in for good: the session survives a reload, and Sign up has nothing more to offer.
		await page.reload();
		await expect(page.getByRole('navigation', { name: 'Primary' })).toContainText(LEARNER.name);
		await page.goto(`${open.url}/signup`);
		await expect(page).toHaveURL(`${open.url}/`);
		await context.close();
	});

	test('a short password is refused on its field, keeping what was typed but never the password', async ({
		browser,
		open
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();
		await page.goto(`${open.url}/signup`);
		await expect(page.getByText('At least 12 characters.')).toBeVisible();

		await page.getByLabel('Name').fill('Edsger Dijkstra');
		await page.getByLabel('Email').fill('edsger@example.com');
		await page.getByLabel('Password').fill('short');
		await page.getByRole('button', { name: 'Create account →' }).click();

		await expect(page.getByText('Use at least 12 characters.')).toBeVisible();
		await expect(page.getByLabel('Password')).toHaveAttribute('aria-invalid', 'true');
		await expect(page.getByLabel('Name')).toHaveValue('Edsger Dijkstra');
		await expect(page.getByLabel('Email')).toHaveValue('edsger@example.com');
		await expect(page.getByLabel('Password')).toHaveValue('');
		await expect(page).toHaveURL(/\/signup/);
		await context.close();
	});

	test('a name over 100 characters is refused on its field, keeping what was typed but never the password', async ({
		browser,
		open
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();
		await page.goto(`${open.url}/signup`);
		const tooLong = 'N'.repeat(101);

		await page.getByLabel('Name').fill(tooLong);
		await page.getByLabel('Email').fill('longname@example.com');
		await page.getByLabel('Password').fill(LEARNER.password);
		await page.getByRole('button', { name: 'Create account →' }).click();

		await expect(page.getByText('Use at most 100 characters.')).toBeVisible();
		await expect(page.getByLabel('Name')).toHaveAttribute('aria-invalid', 'true');
		await expect(page.getByLabel('Name')).toHaveValue(tooLong);
		await expect(page.getByLabel('Email')).toHaveValue('longname@example.com');
		await expect(page.getByLabel('Password')).toHaveValue('');
		await expect(page).toHaveURL(/\/signup/);
		await context.close();
	});

	test('a name of exactly 100 characters, emoji counted once each, is accepted', async ({
		browser,
		open
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();
		await page.goto(`${open.url}/signup`);
		// 100 characters, 200 UTF-16 units: the browser must not count them twice.
		const hundred = '\u{1F600}'.repeat(100);

		await page.getByLabel('Name').fill(hundred);
		await page.getByLabel('Email').fill('hundred@example.com');
		await page.getByLabel('Password').fill(LEARNER.password);
		await page.getByRole('button', { name: 'Create account →' }).click();

		await expect(page).toHaveURL(`${open.url}/`);
		await expect(page.getByRole('navigation', { name: 'Primary' })).toContainText(hundred);
		await context.close();
	});

	test('a direct POST to /api/auth/sign-up/email with a longer name is refused, and nothing is stored', async ({
		request,
		open
	}) => {
		const response = await request.post(`${open.url}/api/auth/sign-up/email`, {
			headers: { origin: open.url },
			data: {
				name: 'N'.repeat(101),
				email: 'direct-long@example.com',
				password: LEARNER.password
			}
		});

		expect(response.status()).toBe(400);
		expect(await response.json()).toMatchObject({
			code: 'NAME_TOO_LONG',
			message: 'The name is too long.'
		});
		expect(response.headers()['set-cookie']).toBeUndefined();
		// No Account was made: the Sign in form does not know that email, whatever the password.
		const signIn = await request.post(`${open.url}/signin`, {
			headers: { origin: open.url, accept: 'text/html' },
			form: { email: 'direct-long@example.com', password: LEARNER.password }
		});
		expect(signIn.status()).toBe(400);
		expect(await signIn.text()).toContain('Email or password is wrong.');
	});

	test('a refused name is refused the same for an email that has an Account, so it is no way to find one out', async ({
		request,
		open
	}) => {
		const post = (email: string, name: string) =>
			request.post(`${open.url}/api/auth/sign-up/email`, {
				headers: { origin: open.url },
				data: { name, email, password: LEARNER.password }
			});

		// LEARNER signed up in the first test of this file, so that email has an Account.
		const known = await post(LEARNER.email, 'N'.repeat(101));
		const unknown = await post('nobody-long@example.com', 'N'.repeat(101));
		const blankKnown = await post(LEARNER.email, '   ');
		const blankUnknown = await post('nobody-blank@example.com', '   ');

		expect(known.status()).toBe(400);
		expect(unknown.status()).toBe(400);
		expect(await known.json()).toEqual(await unknown.json());
		expect(blankKnown.status()).toBe(400);
		expect(await blankKnown.json()).toMatchObject({
			code: 'NAME_REQUIRED',
			message: 'Enter a name.'
		});
		expect(await blankKnown.json()).toEqual(await blankUnknown.json());
	});

	test('an email that cannot be used gets a message that does not say why', async ({
		browser,
		open
	}) => {
		const context = await browser.newContext();
		const page = await context.newPage();
		await page.goto(`${open.url}/signup`);

		await page.getByLabel('Name').fill('Someone Else');
		await page.getByLabel('Email').fill(LEARNER.email.toUpperCase());
		await page.getByLabel('Password').fill(LEARNER.password);
		await page.getByRole('button', { name: 'Create account →' }).click();

		await expect(page.getByText('This email cannot be used. Try a different one.')).toBeVisible();
		await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
		await expect(page.getByLabel('Name')).toHaveValue('Someone Else');
		await expect(page).toHaveURL(/\/signup/);
		await expect(page.locator('#email-error')).not.toHaveText(/already|exists|taken|account/i);
		await context.close();
	});

	test('the side panel is for desktop only: on a phone the form fills the screen without scrolling sideways', async ({
		browser,
		open
	}) => {
		const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
		const page = await context.newPage();
		await page.goto(`${open.url}/signup`);

		await expect(page.getByRole('button', { name: 'Create account →' })).toBeVisible();
		await expect(page.getByText('What an account keeps')).toBeHidden();
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
		await context.close();

		const wide = await browser.newContext({ viewport: { width: 1440, height: 900 } });
		const desktop = await wide.newPage();
		await desktop.goto(`${open.url}/signup`);
		await expect(desktop.getByText('What an account keeps')).toBeVisible();
		await wide.close();
	});

	test('too many attempts from one address are refused, form or not', async ({ request, open }) => {
		// Earlier tests used a few of the 20 attempts this address gets; keep going until the limit says no.
		const attempt = () =>
			request.post(`${open.url}/signup`, {
				headers: { origin: open.url, accept: 'text/html' },
				form: { name: 'Flood', email: 'flood@example.com', password: 'short' }
			});
		let refused = 0;
		let attempts = 0;
		while (attempts < 25 && !refused) {
			attempts += 1;
			const response = await attempt();
			if (response.status() === 429) {
				refused = attempts;
				expect(response.headers()['retry-after']).toMatch(/^\d+$/);
				expect(await response.text()).toContain('Too many attempts. Try again in a few minutes.');
			} else {
				expect(response.status()).toBe(400);
			}
		}

		expect(refused).toBeGreaterThan(1);
		// A well-formed sign-up from the same address is refused too, and creates nothing.
		const valid = await request.post(`${open.url}/signup`, {
			headers: { origin: open.url, accept: 'text/html' },
			form: { name: 'Late', email: 'late@example.com', password: 'a long enough secret' }
		});
		expect(valid.status()).toBe(429);
		// Nothing was created: there is no Account to sign in to. (Password sign-in is not served over HTTP;
		// the Sign in form answers a missing Account and a wrong password alike.)
		const signIn = await request.post(`${open.url}/signin`, {
			headers: { origin: open.url, accept: 'text/html' },
			form: { email: 'late@example.com', password: 'a long enough secret' }
		});
		expect(signIn.status()).toBe(400);
		expect(await signIn.text()).toContain('Email or password is wrong.');
		expect(signIn.headers()['set-cookie']).toBeUndefined();
	});
});
