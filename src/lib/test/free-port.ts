import { createServer } from 'node:net';

// Test-only (imported by tests and their helpers, never by the app): a port nothing listens on right now.
// It binds 127.0.0.1, asks the OS for port 0, reads the port it was given, closes the probe and only then
// resolves, so the caller can listen on the port straight away. A listen error rejects.
export async function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = createServer();
		probe.once('error', reject);
		probe.listen(0, '127.0.0.1', () => {
			const { port } = probe.address() as { port: number };
			probe.close(() => resolve(port));
		});
	});
}
