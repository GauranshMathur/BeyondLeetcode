/**
 * Docker Engine API over the unix socket (ADR 0002). Only the Runner process builds one of these:
 * the socket is root on the host, so the web process never gets it.
 */
import { request } from 'node:http';
import { connect } from 'node:net';

export type ContainerSpec = Record<string, unknown>;

/** stdout is frame type 1, stderr is 2. */
export type OutputFrame = (stream: 1 | 2, payload: Buffer) => void;

export type AttachedContainer = {
	/** Writes `data` to the container's stdin. Stdin stays open until the container exits. */
	sendInput(data: Uint8Array): void;
	/** Resolves when the output stream ends: the container exited, was killed, or `destroy` ran. */
	closed: Promise<void>;
	destroy(): void;
};

/** Longest a lifecycle call (create, start, kill, remove, wait) may wait for the daemon. */
export const engineCallTimeoutMs = 15_000;

/** Longest an image pull may go without the daemon sending anything. */
export const pullIdleTimeoutMs = 60_000;

type Reply = { status: number; body: string };

export function createEngine(socketPath: string, callTimeoutMs = engineCallTimeoutMs) {
	function call(
		method: string,
		path: string,
		json?: unknown,
		timeoutMs = callTimeoutMs
	): Promise<Reply> {
		return new Promise((resolve, reject) => {
			const payload = json === undefined ? undefined : JSON.stringify(json);
			const req = request(
				{
					socketPath,
					method,
					path,
					headers: payload
						? {
								'Content-Type': 'application/json',
								'Content-Length': Buffer.byteLength(payload)
							}
						: {}
				},
				(res) => {
					const chunks: Buffer[] = [];
					res.on('data', (chunk: Buffer) => chunks.push(chunk));
					res.on('end', () =>
						resolve({
							status: res.statusCode ?? 0,
							body: Buffer.concat(chunks).toString('utf8')
						})
					);
					res.on('error', reject);
				}
			);
			req.on('error', reject);
			req.setTimeout(timeoutMs, () => req.destroy(new Error(`Docker ${method} ${path} timed out`)));
			req.end(payload);
		});
	}

	async function assertStatus(reply: Reply, what: string, ...ok: number[]): Promise<Reply> {
		if (!ok.includes(reply.status)) {
			throw new Error(`Docker ${what} failed (${reply.status}): ${reply.body.slice(0, 500)}`);
		}
		return reply;
	}

	async function pull(image: string): Promise<void> {
		const [name, tag = 'latest'] = image.split(':');
		// The daemon streams progress, so this is an idle timeout: a slow pull is fine, a stalled one is not.
		const reply = await call(
			'POST',
			`/images/create?fromImage=${encodeURIComponent(name)}&tag=${encodeURIComponent(tag)}`,
			undefined,
			pullIdleTimeoutMs
		);
		await assertStatus(reply, `pull ${image}`, 200);
		if (/"error"\s*:/.test(reply.body)) throw new Error(`Docker pull ${image} failed`);
	}

	return {
		/** Pulls `image` and resolves once the daemon has it. Throws if the pull fails. */
		pull,

		/** Whether the daemon already holds `image` (inspect answers 404 when it does not). */
		async hasImage(image: string): Promise<boolean> {
			const reply = await assertStatus(
				await call('GET', `/images/${image}/json`),
				`inspect image ${image}`,
				200,
				404
			);
			return reply.status === 200;
		},

		/** Creates a container from `spec`, pulling the image once if the engine does not have it. */
		async create(image: string, spec: ContainerSpec): Promise<string> {
			let reply = await call('POST', '/containers/create', {
				Image: image,
				...spec
			});
			if (reply.status === 404) {
				await pull(image);
				reply = await call('POST', '/containers/create', {
					Image: image,
					...spec
				});
			}
			await assertStatus(reply, 'create', 201);
			return (JSON.parse(reply.body) as { Id: string }).Id;
		},

		/** Opens the hijacked stdin/stdout/stderr stream. Call before `start` so no output is missed. */
		attach(id: string, onFrame: OutputFrame, timeoutMs: number): Promise<AttachedContainer> {
			return new Promise((resolve, reject) => {
				const socket = connect({ path: socketPath });
				let pending: Buffer = Buffer.alloc(0);
				let upgraded = false;
				let settled = false;
				// A stalled daemon must not hang the caller: give up and close the socket.
				const handshake = setTimeout(() => {
					if (settled) return;
					settled = true;
					socket.destroy();
					reject(new Error('Docker attach timed out'));
				}, timeoutMs);
				const closed = new Promise<void>((done) => socket.once('close', () => done()));

				function frames(): void {
					while (pending.length >= 8) {
						const size = pending.readUInt32BE(4);
						if (pending.length < 8 + size) return;
						const stream = pending[0];
						const payload = pending.subarray(8, 8 + size);
						pending = pending.subarray(8 + size);
						if (stream === 1 || stream === 2) onFrame(stream, payload);
					}
				}

				socket.on('error', (error) => {
					clearTimeout(handshake);
					if (!settled) {
						settled = true;
						reject(error);
					}
				});
				socket.on('close', () => {
					clearTimeout(handshake);
					if (!settled) {
						settled = true;
						reject(new Error('Docker attach closed before the stream started'));
					}
				});
				socket.on('connect', () => {
					socket.write(
						`POST /containers/${id}/attach?stream=1&stdin=1&stdout=1&stderr=1 HTTP/1.1\r\n` +
							'Host: docker\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n'
					);
				});
				socket.on('data', (chunk: Buffer) => {
					pending = Buffer.concat([pending, chunk]);
					if (!upgraded) {
						const end = pending.indexOf('\r\n\r\n');
						if (end < 0) return;
						const head = pending.subarray(0, end).toString('latin1');
						pending = pending.subarray(end + 4);
						clearTimeout(handshake);
						if (!/^HTTP\/1\.1 (101|200) /.test(head)) {
							settled = true;
							socket.destroy();
							reject(new Error(`Docker attach failed: ${head.split('\r\n')[0]}`));
							return;
						}
						upgraded = true;
						settled = true;
						resolve({
							sendInput: (data) => void socket.write(data),
							closed,
							destroy: () => socket.destroy()
						});
					}
					frames();
				});
			});
		},

		/**
		 * Registers a waiter for the container's next exit and resolves, once the daemon has it, with
		 * the promise of the exit status. Await the registration before `start`: the status is then
		 * ours even if the container removes itself on exit.
		 */
		wait(id: string): Promise<{ status: Promise<number> }> {
			return new Promise((resolve, reject) => {
				const req = request(
					{
						socketPath,
						method: 'POST',
						path: `/containers/${id}/wait?condition=next-exit`
					},
					(res) => {
						// Registered: the status itself comes at exit, which the hard stop bounds. An error
						// reply keeps the timeout, so a stalled error body cannot hold the caller either.
						if (res.statusCode === 200) req.setTimeout(0);
						const chunks: Buffer[] = [];
						const status = new Promise<number>((done, fail) => {
							res.on('data', (chunk: Buffer) => chunks.push(chunk));
							res.on('error', fail);
							res.on('end', () => {
								const body = Buffer.concat(chunks).toString('utf8');
								if (res.statusCode !== 200)
									fail(new Error(`Docker wait failed (${res.statusCode}): ${body}`));
								else {
									try {
										done((JSON.parse(body) as { StatusCode: number }).StatusCode);
									} catch (error) {
										fail(error);
									}
								}
							});
						});
						status.catch(() => {});
						if (res.statusCode === 200) resolve({ status });
						else status.then(resolve as never, reject);
					}
				);
				req.on('error', reject);
				// A stalled daemon must not hold a concurrency slot.
				req.setTimeout(callTimeoutMs, () => req.destroy(new Error(`Docker wait ${id} timed out`)));
				req.end();
			});
		},

		/** The container's configuration as the daemon holds it. */
		async inspect(id: string): Promise<{ HostConfig: Record<string, unknown> }> {
			const reply = await assertStatus(await call('GET', `/containers/${id}/json`), 'inspect', 200);
			return JSON.parse(reply.body);
		},

		async start(id: string): Promise<void> {
			await assertStatus(await call('POST', `/containers/${id}/start`), 'start', 204);
		},

		async kill(id: string): Promise<void> {
			// 409: the container is already stopped.
			await assertStatus(await call('POST', `/containers/${id}/kill`), 'kill', 204, 404, 409);
		},

		/** Removes the container even if it is running, and its anonymous volumes. */
		async remove(id: string): Promise<void> {
			const reply = await call('DELETE', `/containers/${id}?force=true&v=true`);
			if (reply.status === 409 && /already in progress/.test(reply.body)) {
				// The daemon is already removing it (AutoRemove): wait until it is gone.
				for (let poll = 0; poll < 50; poll++) {
					if ((await call('GET', `/containers/${id}/json`)).status === 404) return;
					await new Promise((resolve) => setTimeout(resolve, 100));
				}
				throw new Error(`Docker remove of ${id} is still in progress`);
			}
			await assertStatus(reply, 'remove', 204, 404);
		},

		/** Every container, running or not, that carries the label key `label`, with its labels and creation time (Unix seconds). */
		async listContainers(
			label: string
		): Promise<{ id: string; created: number; labels: Record<string, string> }[]> {
			const filters = encodeURIComponent(JSON.stringify({ label: [label] }));
			const reply = await assertStatus(
				await call('GET', `/containers/json?all=true&filters=${filters}`),
				'list',
				200
			);
			return (
				JSON.parse(reply.body) as {
					Id: string;
					Created: number;
					Labels: Record<string, string> | null;
				}[]
			).map((c) => ({ id: c.Id, created: c.Created, labels: c.Labels ?? {} }));
		},

		/** Ids of every container, running or not, that carries `label`. */
		async listByLabel(label: string): Promise<string[]> {
			const filters = encodeURIComponent(JSON.stringify({ label: [label] }));
			const reply = await assertStatus(
				await call('GET', `/containers/json?all=true&filters=${filters}`),
				'list',
				200
			);
			return (JSON.parse(reply.body) as { Id: string }[]).map((c) => c.Id);
		}
	};
}

export type Engine = ReturnType<typeof createEngine>;
