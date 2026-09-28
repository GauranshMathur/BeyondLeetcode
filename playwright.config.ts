import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: { command: 'bun run build && PORT=4173 bun ./build/index.js', port: 4173 },
	testMatch: '**/*.e2e.{ts,js}'
});
