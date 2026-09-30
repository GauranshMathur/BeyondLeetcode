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

type Reply = { status: number; body: string };

export function createEngine(socketPath: string) {
	function call(method: string, path: string, json?: unknown): Promise<Reply> {
		return new Promise((resolve, reject) => {
			const payload = json === undefined ? undefined : JSON.stringify(json);
			const req = request(
				{
					socketPath,
					method,
					path,
					headers: payload
						? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
						: {}
				},
				(res) => {
					const chunks: Buffer[] = [];
					res.on('data', (chunk: Buffer) => chunks.push(chunk));
					res.on('end', () =>
						resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') })
					);
					res.on('error', reject);
				}
			);
			req.on('error', reject);
			req.end(payload);
		});
	}

	async function expect(reply: Reply, what: string, ...ok: number[]): Promise<Reply> {
		if (!ok.includes(reply.status)) {
			throw new Error(`Docker ${what} failed (${reply.status}): ${reply.body.slice(0, 500)}`);
		}
		return reply;
	}

	async function pull(image: string): Promise<void> {
		const [name, tag = 'latest'] = image.split(':');
		const reply = await call(
			'POST',
			`/images/create?fromImage=${encodeURIComponent(name)}&tag=${encodeURIComponent(tag)}`
		);
		await expect(reply, `pull ${image}`, 200);
		if (/"error"\s*:/.test(reply.body)) throw new Error(`Docker pull ${image} failed`);
	}

	return {
		/** Creates a container from `spec`, pulling the image once if the engine does not have it. */
		async create(image: string, spec: ContainerSpec): Promise<string> {
			let reply = await call('POST', '/containers/create', { Image: image, ...spec });
			if (reply.status === 404) {
				await pull(image);
				reply = await call('POST', '/containers/create', { Image: image, ...spec });
			}
			await expect(reply, 'create', 201);
			return (JSON.parse(reply.body) as { Id: string }).Id;
		},

		/** Opens the hijacked stdin/stdout/stderr stream. Call before `start` so no output is missed. */
		attach(id: string, onFrame: OutputFrame): Promise<AttachedContainer> {
			return new Promise((resolve, reject) => {
				const socket = connect({ path: socketPath });
				let pending: Buffer = Buffer.alloc(0);
				let upgraded = false;
				let settled = false;
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
					if (!settled) {
						settled = true;
						reject(error);
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

		async start(id: string): Promise<void> {
			await expect(await call('POST', `/containers/${id}/start`), 'start', 204);
		},

		async kill(id: string): Promise<void> {
			// 409: the container is already stopped.
			await expect(await call('POST', `/containers/${id}/kill`), 'kill', 204, 404, 409);
		},

		/** Removes the container even if it is running, and its anonymous volumes. */
		async remove(id: string): Promise<void> {
			await expect(await call('DELETE', `/containers/${id}?force=true&v=true`), 'remove', 204, 404);
		},

		/** Ids of every container, running or not, that carries `label`. */
		async listByLabel(label: string): Promise<string[]> {
			const filters = encodeURIComponent(JSON.stringify({ label: [label] }));
			const reply = await expect(
				await call('GET', `/containers/json?all=true&filters=${filters}`),
				'list',
				200
			);
			return (JSON.parse(reply.body) as { Id: string }[]).map((c) => c.Id);
		}
	};
}

export type Engine = ReturnType<typeof createEngine>;
