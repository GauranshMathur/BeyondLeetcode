import { defineConfig } from 'vitest/config';

// Tests that start real Docker containers. Run by `bun run test:sandbox`, never by `bun run test`.
export default defineConfig({
	test: {
		name: 'sandbox',
		environment: 'node',
		include: ['src/**/*.sandbox.test.ts'],
		expect: { requireAssertions: true },
		fileParallelism: false
	}
});
