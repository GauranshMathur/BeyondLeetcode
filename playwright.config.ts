import { defineConfig } from '@playwright/test';

// A fresh temp database per run, migrated here: the app never migrates on start (C8a owns that).
// The content is the catalogue fixture. The Runner is scripted (no Docker): real execution is covered by the
// Sandbox tests and the image smoke test.
const web = [
	'export DATABASE_URL="file:$(mktemp -d)/e2e.db"',
	'export CONTENT_DIR=src/lib/server/content/fixture',
	'export ORIGIN=http://localhost:4173',
	// Test-only: the Learning core gets the scripted Runner, never the Docker one. Refused when NODE_ENV=production.
	'export RUNNER_ADAPTER=scripted',
	// Test-only: lets each e2e file act as its own Learner (test_learner cookie). Never set outside this server.
	'export IDENTITY_TEST_LEARNER=1',
	'bunx prisma migrate deploy',
	'bun run build',
	'PORT=4173 bun ./build/index.js'
].join(' && ');

export default defineConfig({
	webServer: { command: web, port: 4173 },
	use: { baseURL: 'http://localhost:4173' },
	// Each file acts as its own Learner (see IDENTITY_TEST_LEARNER above), so files can run at the same time.
	workers: 4,
	testMatch: '**/*.e2e.{ts,js}'
});
