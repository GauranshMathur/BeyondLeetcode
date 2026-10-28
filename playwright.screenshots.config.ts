import { defineConfig } from '@playwright/test';

// README screenshots (C125). Not part of `test:e2e` or CI: playwright.config.ts matches only *.e2e.ts, and the
// script here is capture.ts. Regenerate every image with:
//   npx playwright test -c playwright.screenshots.config.ts
// (run it under the shared heavy lock on the shared host).
//
// A Local Mode server of its own on 4180 (3000 is a preview Instance, 4173 to 4175 are the e2e servers), on a
// fresh temp database, serving the real content/. The scripted Runner needs the test switch below; it is
// never set outside throwaway servers like this one. The app never migrates on start, so migrate here.
const PORT = 4180;

const server = [
	'export DATABASE_URL="file:$(mktemp -d)/screenshots.db"',
	`export ORIGIN=http://localhost:${PORT}`,
	'export CONTENT_DIR=content',
	'export RUNNER_ADAPTER=scripted',
	'export IDENTITY_TEST_LEARNER=1',
	'bunx prisma migrate deploy',
	'bun run build',
	`PORT=${PORT} bun ./src/lib/server/web-entry.ts`
].join(' && ');

export default defineConfig({
	testDir: 'scripts/screenshots',
	testMatch: 'capture.ts',
	// The build runs inside the server command.
	webServer: { command: server, port: PORT, timeout: 5 * 60_000 },
	use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1440, height: 900 } },
	workers: 1,
	retries: 0
});
