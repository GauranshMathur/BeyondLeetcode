import { defineConfig } from '@playwright/test';

// The image smoke test (C8c): runs against an already composed stack, so no webServer.
// SMOKE_BASE_URL is the composed web URL, e.g. http://localhost:3000.
const baseURL = process.env.SMOKE_BASE_URL;
if (!baseURL) throw new Error('Set SMOKE_BASE_URL to the composed web URL');

export default defineConfig({
	testMatch: '**/*.smoke.ts',
	// One flow, run once per Language; the first Run of each Language can wait on a cold sandbox image.
	timeout: 10 * 60_000,
	workers: 1,
	retries: 0,
	use: { baseURL }
});
