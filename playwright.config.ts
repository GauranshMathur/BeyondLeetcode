import { defineConfig } from '@playwright/test';

// Two servers, each on a fresh temp database, migrated here: the app never migrates on start (C8a owns that).
// The content is the catalogue fixture. The Runner is scripted (no Docker): real execution is covered by the
// Sandbox tests and the image smoke test.
//   4173: the Local Mode server. Its "setup" project chooses Local through the real screen.
//   4175: the convert server (see below).
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
	// Test-only: write-ahead logging, so a reader never blocks a writer. The Multi-user files share this one
	// file between the server and four test processes; the app's own client waits for no lock (busy timeout 0)
	// and opens deferred transactions, which in the default journal fail at once when anyone else is writing.
	// The mode is stored in the file, so the server finds it on.
	`bun -e 'new (require("bun:sqlite").Database)(process.env.DATABASE_URL.slice(5)).exec("PRAGMA journal_mode=WAL")'`,
	'PORT=4174 bun ./build/index.js'
].join(' && ');

// 4175: a Local Instance that the convert test turns into a Multi-user one. Its own server and database, because
// the conversion is one-way and every other Local file shares 4173. Same build as the others (the first server
// builds it); the test switch is only what the scripted Runner requires.
const convert = [
	'export DATABASE_URL="file:$(mktemp -d)/e2e-convert.db"',
	'export ORIGIN=http://localhost:4175',
	'export BETTER_AUTH_SECRET=e2e-only-secret-e2e-only-secret-e2e-only-0123',
	'export CONTENT_DIR=src/lib/server/content/fixture',
	'export RUNNER_ADAPTER=scripted',
	// Required by the scripted Runner; the test never sets the cookie, so the Local Learner is the default one.
	'export IDENTITY_TEST_LEARNER=1',
	'bunx prisma migrate deploy',
	`bun -e 'new (require("bun:sqlite").Database)(process.env.DATABASE_URL.slice(5)).exec("PRAGMA journal_mode=WAL")'`,
	'PORT=4175 bun ./build/index.js'
].join(' && ');

export default defineConfig({
	webServer: [
		{ command: web, port: 4173 },
		{ command: multi, port: 4174 },
		{ command: convert, port: 4175 }
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
			testIgnore: ['**/setup.e2e.ts', '**/*.multi.e2e.ts', '**/convert.e2e.ts'],
			// The @mobile flows run in the "mobile" project.
			grepInvert: /@mobile/,
			dependencies: ['setup']
		},
		{
			name: 'setup-multi',
			testMatch: '**/setup.multi.e2e.ts',
			use: { baseURL: 'http://localhost:4174' }
		},
		{
			name: 'convert',
			testMatch: '**/convert.e2e.ts',
			use: { baseURL: 'http://localhost:4175' }
		},
		{
			name: 'e2e-multi',
			testMatch: '**/*.multi.e2e.ts',
			testIgnore: '**/setup.multi.e2e.ts',
			grepInvert: /@mobile/,
			use: { baseURL: 'http://localhost:4174' },
			dependencies: ['setup-multi']
		},
		// C51: a phone (390 x 844, touch) walks one flow on each of the Map, Topic, Chapter, Problem and Sign in
		// screens: the tests tagged @mobile in their files. Each has its own Learner, so none meets another's
		// leftovers. The Sign in flow uses the Multi-user server (4174) and its admin, hence "setup-multi".
		{
			name: 'mobile',
			testMatch: [
				'**/routes/page.e2e.ts',
				'**/topics/topic.e2e.ts',
				'**/chapters/chapter.e2e.ts',
				'**/problems/problem.e2e.ts',
				'**/signin/signin.multi.e2e.ts'
			],
			grep: /@mobile/,
			use: { viewport: { width: 390, height: 844 }, hasTouch: true },
			dependencies: ['setup', 'setup-multi']
		}
	]
});
