import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

// The dev-run walk (.github/dev-run.sh): it drives a server that script started, so there is no webServer.
// DEV_RUN_BASE_URL is the origin the server answers on, DEV_RUN_OUT the folder that takes the screenshots, the
// timings and the JSON report, and DEV_RUN_CONTENT the content folder the server reads (the walk edits it).
const baseURL = process.env.DEV_RUN_BASE_URL;
if (!baseURL) throw new Error('Set DEV_RUN_BASE_URL to the URL the server answers on');
const out = process.env.DEV_RUN_OUT ?? 'dev-run-out';

export default defineConfig({
	testDir: 'src/routes',
	testMatch: '**/dev-run.walk.ts',
	// The first reference run of a Language can wait on a cold Sandbox image.
	timeout: 5 * 60_000,
	workers: 1,
	retries: 0,
	outputDir: join(out, 'pw-results'),
	reporter: [
		['list'],
		['json', { outputFile: process.env.DEV_RUN_REPORT ?? join(out, 'report.json') }]
	],
	use: { baseURL }
});
