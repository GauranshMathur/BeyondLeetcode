import { defineConfig } from '@playwright/test';

// The Runner is real (Docker), on its own port with a test-only token; the web server reaches it over HTTP.
const runnerPort = process.env.E2E_RUNNER_PORT ?? '18787';
const runnerToken = 'e2e-runner-token-0123456789abcdef-0123456789';

// A fresh temp database per run, migrated here: the app never migrates on start (C8a owns that).
// The content is the catalogue fixture.
const web = [
	'export DATABASE_URL="file:$(mktemp -d)/e2e.db"',
	'export CONTENT_DIR=src/lib/server/content/fixture',
	'export ORIGIN=http://localhost:4173',
	`export RUNNER_URL=http://127.0.0.1:${runnerPort}`,
	`export RUNNER_TOKEN=${runnerToken}`,
	'bunx prisma migrate deploy',
	'bun run build',
	'PORT=4173 bun ./build/index.js'
].join(' && ');

export default defineConfig({
	webServer: [
		{
			command: `RUNNER_PORT=${runnerPort} RUNNER_HOST=127.0.0.1 RUNNER_TOKEN=${runnerToken} bun run runner`,
			port: Number(runnerPort)
		},
		{ command: web, port: 4173 }
	],
	// With two web servers Playwright cannot infer the base URL.
	use: { baseURL: 'http://localhost:4173' },
	testMatch: '**/*.e2e.{ts,js}'
});
