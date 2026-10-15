import { defineConfig } from '@playwright/test';

// Two servers, each on a fresh temp database, migrated here: the app never migrates on start (C8a owns that).
// The content is the catalogue fixture. The Runner is scripted (no Docker): real execution is covered by the
// Sandbox tests and the image smoke test.
//   4173: the Local Mode server. Its "setup" project chooses Local through the real screen.
//   4174: the Multi-user server. Its "setup-multi" project chooses Multi-user and creates the admin through
//         the real screens. It is built once, by the first server, and starts after it (servers start in order).
const common = [
	'export CONTENT_DIR=src/lib/server/content/fixture',
	// Test-only: the Learning core gets the scripted Runner, never the Docker one. Refused when NODE_ENV=production.
	'export RUNNER_ADAPTER=scripted',
	// Test-only: lets each e2e file act as its own Learner (test_learner cookie) and lets Setup choose
	// Multi-user. Never set outside these servers. The Multi-user server never reads the cookie: it signs in
	// through the real form.
	'export IDENTITY_TEST_LEARNER=1'
];

const web = [
	'export DATABASE_URL="file:$(mktemp -d)/e2e.db"',
	'export ORIGIN=http://localhost:4173',
	...common,
	'bunx prisma migrate deploy',
	'bun run build',
	'PORT=4173 bun ./build/index.js'
].join(' && ');

const multi = [
	'export DATABASE_URL="file:$(mktemp -d)/e2e-multi.db"',
	'export ORIGIN=http://localhost:4174',
	// Test-only secret for signing sessions on the throwaway database.
	'export BETTER_AUTH_SECRET=e2e-only-secret-e2e-only-secret-e2e-only-0123',
	...common,
	'bunx prisma migrate deploy',
	'PORT=4174 bun ./build/index.js'
].join(' && ');

export default defineConfig({
	webServer: [
		{ command: web, port: 4173 },
		{ command: multi, port: 4174 }
	],
	use: { baseURL: 'http://localhost:4173' },
	// Each file acts as its own Learner (see IDENTITY_TEST_LEARNER above), so files can run at the same time.
	workers: 4,
	// "setup" chooses Local through the real screen on the fresh database; every other file depends on it.
	// The Multi-user files (*.multi.e2e.ts) run on the second server, after "setup-multi" created its admin.
	projects: [
		{ name: 'setup', testMatch: '**/setup.e2e.ts' },
		{
			name: 'e2e',
			testMatch: '**/*.e2e.{ts,js}',
			testIgnore: ['**/setup.e2e.ts', '**/*.multi.e2e.ts'],
			dependencies: ['setup']
		},
		{
			name: 'setup-multi',
			testMatch: '**/setup.multi.e2e.ts',
			use: { baseURL: 'http://localhost:4174' }
		},
		{
			name: 'e2e-multi',
			testMatch: '**/*.multi.e2e.ts',
			testIgnore: '**/setup.multi.e2e.ts',
			use: { baseURL: 'http://localhost:4174' },
			dependencies: ['setup-multi']
		}
	]
});
