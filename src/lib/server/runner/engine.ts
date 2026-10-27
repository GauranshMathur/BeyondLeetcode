/**
 * Docker Engine API over the unix socket (ADR 0002). Only the Runner process builds one of these:
 * the socket is root on the host, so the web process never gets it.
 */
import { type ClientRequest, request } from 'node:http';
import { connect } from 'node:net';
import { engineCallTimeoutMs } from './config';

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

export { engineCallTimeoutMs };

/** Longest an image pull may go without the daemon sending anything. */
export const pullIdleTimeoutMs = 60_000;

/** Longest one pull attempt may take in all, however much progress it keeps sending. */
export const pullMaxMs = 30 * 60_000;

/** The daemon refused a create because the container name is taken: not our container to remove. */
export class NameConflictError extends Error {
	constructor(readonly containerName: string | undefined) {
		super(`Docker create failed (409): the container name ${containerName ?? ''} is in use`);
		this.name = 'NameConflictError';
	}
}

/**
 * Splits an image reference into what the pull endpoint wants: `fromImage` and `tag`, where `tag`
 * may be a digest. Handles `name`, `name:tag`, `host:5000/name:tag`, `name@sha256:...` and
 * `name:tag@sha256:...` (the digest wins). Throws on an empty name, tag or digest, or on more
 * than one `@`: Docker reads an empty tag as "pull every tag".
 */
export function parseImageRef(image: string): { name: string; tag: string } {
	const bad = (why: string) =>
		new Error(`Malformed image reference ${JSON.stringify(image)}: ${why}`);
	const parts = image.split('@');
	if (parts.length > 2) throw bad('more than one @');
	const [named, digest] = parts;
	const colon = named.lastIndexOf(':');
	const hasTag = colon > named.lastIndexOf('/');
	const name = hasTag ? named.slice(0, colon) : named;
	const written = hasTag ? named.slice(colon + 1) : undefined;
	// An allowlist per part (Docker's reference grammar), so nothing reaches the daemon that it
	// would read as "every tag" or that makes the request itself fail.
	if (!name || name.endsWith('/') || name.endsWith(':') || hasControlOrSpace(name))
		throw bad('invalid name');
	if (written !== undefined && !tagPattern.test(written)) throw bad('invalid tag');
	if (digest !== undefined && !digestPattern.test(digest)) throw bad('invalid digest');
	return { name, tag: digest ?? written ?? 'latest' };
}

const tagPattern = /^\w[\w.-]{0,127}$/;
const digestPattern = /^[A-Za-z][A-Za-z0-9]*(?:[-_+.][A-Za-z][A-Za-z0-9]*)*:[0-9A-Za-z=_-]{32,}$/;

function hasControlOrSpace(text: string): boolean {
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		if (code <= 0x20 || code === 0x7f) return true;
	}
	return false;
}

/** How much of the previous chunk is kept so `"error"` split across two chunks is still seen. */
const pullScanTail = 16;

type Reply = { status: number; body: string };

/** The daemon does not hold the image a create asked for (404). The Runner never pulls inside a Run. */
export class ImageMissingError extends Error {
	constructor(readonly image: string) {
		super(`Sandbox image ${image} is missing`);
		this.name = 'ImageMissingError';
	}
}

/**
 * A deadline that rejects on its own. `req.setTimeout(..., () => req.destroy(err))` is not enough:
 * on Bun 1.2.19, the production runtime, `destroy(err)` closes the socket without emitting 'error',
 * so the promise never settled (#284). Here the timer rejects first, then destroys the request;
 * anything the request emits afterwards (a late 'error', a late response) lands on a settled guard.
 */
function guard(req: ClientRequest, ms: number, what: string, reject: (error: Error) => void) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let expired = false;
	function arm(): void {
		clearTimeout(timer);
		if (expired) return;
		timer = setTimeout(() => {
			expired = true;
			reject(new Error(`${what} timed out`));
			req.destroy();
		}, ms);
	}
	return {
		/** (Re)starts the clock: the first call sets an absolute deadline, a later one makes it an idle timeout. */
		arm,
		clear(): void {
			clearTimeout(timer);
		},
		/** True once the deadline has fired: a reply that arrives after it is discarded. */
		get expired(): boolean {
			return expired;
		}
	};
}

export function createEngine(
	socketPath: string,
	callTimeoutMs = engineCallTimeoutMs,
	pullLimits: { idleMs?: number; maxMs?: number } = {}
) {
	const { idleMs = pullIdleTimeoutMs, maxMs = pullMaxMs } = pullLimits;
	/**
	 * `timeoutMs` is an absolute deadline for the whole reply; with `idle` it restarts whenever the
	 * daemon sends a chunk (a pull streams progress).
	 */
	function call(
		method: string,
		path: string,
		json?: unknown,
		timeoutMs = callTimeoutMs,
		idle = false
	): Promise<Reply> {
		return new Promise((resolve, reject) => {
			const payload = json === undefined ? undefined : JSON.stringify(json);
			let timer: ReturnType<typeof guard> | undefined;
			const settle = {
				resolve: (reply: Reply) => {
					timer?.clear();
					resolve(reply);
				},
				reject: (error: Error) => {
					timer?.clear();
					reject(error);
				}
			};
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
					if (timer?.expired) return void res.destroy();
					const chunks: Buffer[] = [];
					res.on('data', (chunk: Buffer) => {
						chunks.push(chunk);
						if (idle) timer?.arm();
					});
					res.on('end', () =>
						settle.resolve({
							status: res.statusCode ?? 0,
							body: Buffer.concat(chunks).toString('utf8')
						})
					);
					res.on('error', settle.reject);
				}
			);
			timer = guard(req, timeoutMs, `Docker ${method} ${path}`, reject);
			req.on('error', settle.reject);
			timer.arm();
			req.end(payload);
		});
	}

	async function assertStatus(reply: Reply, what: string, ...ok: number[]): Promise<Reply> {
		if (!ok.includes(reply.status)) {
			throw new Error(`Docker ${what} failed (${reply.status}): ${reply.body.slice(0, 500)}`);
		}
		return reply;
	}

	/**
	 * Pulls `image`. Two clocks: an idle timeout that restarts on every chunk, and an absolute cap
	 * that never restarts, so a daemon that keeps sending progress cannot hold the pull forever. The
	 * stream is scanned as it arrives, one chunk (plus a few bytes of the one before) at a time: a
	 * stream that reports an error fails the pull at that chunk.
	 */
	function pull(image: string): Promise<void> {
		const { name, tag } = parseImageRef(image);
		const path = `/images/create?fromImage=${encodeURIComponent(name)}&tag=${encodeURIComponent(tag)}`;
		return new Promise((resolve, reject) => {
			let idle: ReturnType<typeof guard> | undefined;
			let cap: ReturnType<typeof guard> | undefined;
			let done = false;
			const finish = (error?: Error) => {
				if (done) return;
				done = true;
				idle?.clear();
				cap?.clear();
				if (error) {
					req.destroy();
					reject(error);
				} else resolve();
			};
			const req = request({ socketPath, method: 'POST', path }, (res) => {
				if (done || idle?.expired || cap?.expired) return void res.destroy();
				const ok = res.statusCode === 200;
				let tail = '';
				let errorBody = '';
				res.on('data', (chunk: Buffer) => {
					idle?.arm();
					const text = chunk.toString('utf8');
					if (!ok) {
						errorBody = (errorBody + text).slice(0, 500);
						return;
					}
					const seen = tail + text;
					if (/"error"\s*:/.test(seen)) return finish(new Error(`Docker pull ${image} failed`));
					tail = seen.slice(-pullScanTail);
				});
				res.on('end', () =>
					finish(
						ok
							? undefined
							: new Error(`Docker pull ${image} failed (${res.statusCode}): ${errorBody}`)
					)
				);
				res.on('error', finish);
			});
			const fail = (error: Error) => finish(error);
			idle = guard(req, idleMs, `Docker POST ${path} (idle)`, fail);
			cap = guard(req, maxMs, `Docker POST ${path} (absolute cap)`, fail);
			req.on('error', fail);
			idle.arm();
			cap.arm();
			req.end();
		});
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

		/**
		 * Creates a container from `spec`. A missing image (404) throws `ImageMissingError` at once:
		 * a pull has no upper bound, so it never runs inside a Run. The image loop pulls it.
		 * With `name` the container is named on our side, so a Run whose create call times out
		 * can still remove it by that name even though the reply never reached it.
		 */
		async create(image: string, spec: ContainerSpec, name?: string): Promise<string> {
			const query = name ? `?name=${encodeURIComponent(name)}` : '';
			const reply = await call('POST', `/containers/create${query}`, {
				Image: image,
				...spec
			});
			if (reply.status === 404) throw new ImageMissingError(image);
			if (reply.status === 409) throw new NameConflictError(name);
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
				// A stalled daemon must not hold a concurrency slot: the deadline covers the
				// registration, or the whole reply when the daemon answers with an error.
				let timer: ReturnType<typeof guard> | undefined;
				const req = request(
					{
						socketPath,
						method: 'POST',
						path: `/containers/${id}/wait?condition=next-exit`
					},
					(res) => {
						if (timer?.expired) return void res.destroy();
						// Registered: the status itself comes at exit, which the hard stop bounds.
						if (res.statusCode === 200) timer?.clear();
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
						else status.then(resolve as never, reject).finally(() => timer?.clear());
					}
				);
				timer = guard(req, callTimeoutMs, `Docker wait ${id}`, reject);
				req.on('error', (error) => {
					timer?.clear();
					reject(error);
				});
				timer.arm();
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

		/**
		 * Removes the container even if it is running, and its anonymous volumes. Resolves true if
		 * there was one to remove, false if the daemon knows no such container (404).
		 */
		async remove(id: string): Promise<boolean> {
			// Encoded: the argument is an id or a name, and never decides the path.
			const ref = encodeURIComponent(id);
			const deadline = Date.now() + callTimeoutMs;
			const reply = await call('DELETE', `/containers/${ref}?force=true&v=true`);
			if (reply.status === 409 && /already in progress/.test(reply.body)) {
				// The daemon is already removing it (AutoRemove): wait until it is gone.
				// One overall deadline from the start of the remove (the call timeout), so a daemon that never finishes cannot hold
				// the caller, or a late-remove slot, for 50 polls of a full call timeout each.
				while (Date.now() < deadline) {
					const left = deadline - Date.now();
					try {
						if ((await call('GET', `/containers/${ref}/json`, undefined, left)).status === 404)
							return true;
					} catch (error) {
						// A poll cut short by the deadline is the deadline; any other failure stands.
						if (Date.now() < deadline) throw error;
						break;
					}
					await new Promise((resolve) => setTimeout(resolve, Math.min(100, left)));
				}
				throw new Error(`Docker remove of ${id} is still in progress`);
			}
			await assertStatus(reply, 'remove', 204, 404);
			return reply.status === 204;
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
		}
	};
}

export type Engine = ReturnType<typeof createEngine>;
