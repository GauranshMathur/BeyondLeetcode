import { describe, expect, it, vi } from 'vitest';
import { sandboxConfig } from './config';
import type { Engine } from './engine';
import { createSandboxRunner } from './sandbox';

const request = {
	language: 'python' as const,
	files: { 'main.py': '' },
	tests: [{ id: 'a', input: '' }],
	limits: { timeoutMs: 1000, memoryMb: 128 }
};

const okLine = JSON.stringify({ i: 0, status: 'ok', stdout: 'hi', stderr: '' });

/** An Engine whose container prints `output` to stdout and then exits with `exitCode`. */
function fakeEngine(options: {
	output?: string;
	exitCode?: number;
	attach?: () => Promise<never>;
	removeFails?: boolean;
	neverEnds?: boolean;
}) {
	const calls: string[] = [];
	let end: () => void = () => {};
	const closed = new Promise<void>((resolve) => {
		end = resolve;
	});
	const engine = {
		create: async () => 'c1',
		wait: async () => options.exitCode ?? 0,
		attach: options.attach
			? options.attach
			: async (_id: string, onFrame: (s: 1 | 2, p: Buffer) => void) => ({
					sendInput() {
						if (options.output) onFrame(1, Buffer.from(`${options.output}\n`));
						if (!options.neverEnds) end();
					},
					closed,
					destroy: end
				}),
		start: async () => {},
		kill: async (id: string) => void calls.push(`kill ${id}`),
		remove: vi.fn(async (id: string) => {
			calls.push(`remove ${id}`);
			if (options.removeFails) throw new Error('daemon down');
		}),
		inspect: async () => ({ HostConfig: {} }),
		listByLabel: async () => []
	} as unknown as Engine;
	return { engine, calls };
}

describe('Sandbox runner: harness exit status', () => {
	it('returns the results when the harness exits 0', async () => {
		const { engine } = fakeEngine({ output: okLine });

		const result = await createSandboxRunner(engine).execute(request);

		expect(result.results).toEqual([{ id: 'a', status: 'ok', stdout: 'hi', stderr: '' }]);
	});

	it('discards the results and fails when the harness exits non-zero', async () => {
		const { engine } = fakeEngine({ output: okLine, exitCode: 1 });

		await expect(createSandboxRunner(engine).execute(request)).rejects.toThrow(
			/exited with status 1/
		);
	});

	it('keeps timeouts when the exit is the Runner hard stop, not a failure', async () => {
		vi.useFakeTimers();
		try {
			const { engine, calls } = fakeEngine({ neverEnds: true, exitCode: 137 });
			const pending = createSandboxRunner(engine).execute(request);

			await vi.advanceTimersByTimeAsync(sandboxConfig.containerTimeoutMs + 1);
			const result = await pending;

			expect(result.results).toEqual([{ id: 'a', status: 'timeout', stdout: '', stderr: '' }]);
			expect(calls).toContain('kill c1');
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('Sandbox runner: leaks and stalls', () => {
	it('retries a failing remove three times and does not mask the original error', async () => {
		const { engine } = fakeEngine({ output: okLine, exitCode: 2, removeFails: true });
		vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(createSandboxRunner(engine).execute(request)).rejects.toThrow(
			/exited with status 2/
		);

		expect(engine.remove).toHaveBeenCalledTimes(3);
	});

	it('starts the hard stop before attach, so a stalled attach cannot hang the request', async () => {
		vi.useFakeTimers();
		try {
			let stalled: (e: Error) => void = () => {};
			const { engine, calls } = fakeEngine({
				attach: () =>
					new Promise<never>((_, reject) => {
						stalled = reject;
					})
			});
			const pending = createSandboxRunner(engine).execute(request);
			const outcome = expect(pending).rejects.toThrow();

			await vi.advanceTimersByTimeAsync(sandboxConfig.containerTimeoutMs + 1);
			expect(calls).toContain('kill c1');
			stalled(new Error('Docker attach timed out'));
			await outcome;

			expect(calls).toContain('remove c1');
		} finally {
			vi.useRealTimers();
		}
	});
});
