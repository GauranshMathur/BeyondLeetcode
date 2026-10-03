import { defineConfig } from '@playwright/test';

// A fresh temp database per run, migrated here: the app never migrates on start (C8a owns that).
// The content is the catalogue fixture.
const command = [
	'export DATABASE_URL="file:$(mktemp -d)/e2e.db"',
	'export CONTENT_DIR=src/lib/server/content/fixture',
	'export ORIGIN=http://localhost:4173',
	'bunx prisma migrate deploy',
	'bun run build',
	'PORT=4173 bun ./build/index.js'
].join(' && ');

export default defineConfig({
	webServer: { command, port: 4173 },
	testMatch: '**/*.e2e.{ts,js}'
});
