/**
 * Run under Bun, not vitest, with a template database already migrated with `bunx prisma migrate deploy`:
 *
 *   DATABASE_URL=file:<a migrated template> CONTENT_DIR=content FRESH_STARTS=<n> bun src/lib/server/prisma-fresh-start.bun-check.ts
 *
 * The first stress (prisma-stress.bun-check.ts) is one long-lived process. The crashes it was built for came on a
 * fresh `web` process's first requests, so this one starts a new process for every start. Each start copies the
 * template to a new temporary folder, runs a child of this same file on the copy, and in that child makes the
 * database calls a fresh `web` makes in the image smoke flow, through the functions `createApp` uses: the catalogue,
 * `createDb`, the Instance's start read, Identity, Setup's Local choice, and the Learning core's requests, each
 * request after an Identity resolve as the server's hook does it. It does not call `createApp`, which refuses the
 * scripted Runner when NODE_ENV is production (the image sets it), and it makes no Multi-user call: it is Local
 * Mode only, as the smoke flow is.
 *
 * Every error is printed in full: the call, the error's class name, its message and its stack. `web` logs only a
 * class name, so this is where a query-engine failure shows what it was. The script prints messages on purpose,
 * which is safe only because it runs in its own process, on the bundled content and a throwaway database, in CI.
 * It sets no DEBUG variable and no Prisma `log` option.
 *
 * The parent's last line is `prisma-fresh-start starts=<n> calls=<n> errors=<n> failed-starts=<n> not-printed=<n>`
 * (and `not-run=<n>` when it stopped early) and `<class>=<count>` for each class. Exit 1 when any start saw a
 * `PrismaClient*` error or failed, 0 otherwise. A refusal of the Learning core is counted by code and is not an
 * error. A start fails when its child was killed, timed out, printed no complete last line, caught any error that
 * is not a Learning-core refusal, or made no Learning-core call. After three timed-out starts in a row the parent
 * stops and says so. A child's output is kept only up to a fixed size, and the blocks of at most 50 starts are
 * printed in full.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LANGUAGES } from '../languages.ts';
import { loadCatalogue } from './content/catalogue.ts';
import { createDb } from './db.ts';
import { createIdentity, createLocalIdentity, type ResolveEvent } from './identity/index.ts';
import { createInstance } from './instance.ts';
import { createLearningCore, type Learner, LearningError } from './learning/core.ts';
import { createCatalogueScriptedRunner } from './runner/scripted-catalogue.ts';

const CHILD_FLAG = '--child';
const DEADLINE_MS = 120_000;
/** Starts whose blocks (error or process) are printed in full; the rest are only counted. */
const PRINTED_STARTS = 50;
/** Timed-out starts in a row after which the parent stops. */
const MAX_TIMEOUTS_IN_A_ROW = 3;
/** Bytes of one child's output kept: its first and its last part. */
const KEEP_HEAD = 32 * 1024;
const KEEP_TAIL = 32 * 1024;
/** How long after a child's `exit` the parent waits for its pipes before it takes what it has. */
const GRACE_MS = 2_000;
const CHILD_LAST_LINE = 'prisma-fresh-start-child ';
const AGGREGATE_PREFIX = 'prisma-fresh-start starts=';
const REFUSALS_LINE = 'learning-core refusals (not errors) ';
/** A refusal's code on a child's last line, so it is not read as an error class. */
const REFUSED = 'refused-';
/** The variables a child gets: what Bun needs to run and the stress's own settings, nothing else. */
const CHILD_ENV = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'TZ', 'NODE_ENV', 'CONTENT_DIR'];

const bump = (counts: Map<string, number>, key: string, by = 1) =>
	counts.set(key, (counts.get(key) ?? 0) + by);

const list = (counts: Map<string, number>) => [...counts].map(([k, v]) => `${k}=${v}`);

/** Lines of text indented, so none can be read as one of this file's own markers. */
const indent = (text: string, by = '    ') =>
	text
		.split('\n')
		.map((line) => `${by}${line}`)
		.join('\n');

// ---------------------------------------------------------------------------------------------------------------
// The child: one fresh process, one start

async function child(start: number): Promise<never> {
	const databaseUrl = process.env.DATABASE_URL;
	const contentDir = process.env.CONTENT_DIR;
	if (!databaseUrl) throw new Error('DATABASE_URL is not set');
	if (!contentDir) throw new Error('CONTENT_DIR is not set');

	let calls = 0;
	let coreCalls = 0;
	let errors = 0;
	let otherErrors = 0;
	let queryEngine = 0;
	const classes = new Map<string, number>();
	const refusals = new Map<string, number>();

	/** The class name `web` would log for this thrown value, kept to characters a summary line can carry. */
	const className = (error: unknown): string => {
		const raw = !(error instanceof Error)
			? typeof error
			: error.name && error.name !== 'Error'
				? error.name
				: error.constructor?.name || 'Error';
		return raw.replace(/[^A-Za-z0-9_$.]/g, '_');
	};

	/** Makes one call and catches whatever it throws; the answer is undefined when it threw. */
	async function attempt<T>(
		call: string,
		make: () => Promise<T>,
		learningCore = false
	): Promise<T | undefined> {
		calls++;
		if (learningCore) coreCalls++;
		try {
			return await make();
		} catch (error) {
			if (error instanceof LearningError) {
				bump(refusals, error.code);
				return undefined;
			}
			errors++;
			const name = className(error);
			bump(classes, name);
			if (name.startsWith('PrismaClient')) queryEngine++;
			else otherErrors++;
			const message = error instanceof Error ? error.message : String(error);
			const stack = error instanceof Error ? (error.stack ?? '(no stack)') : '(not an Error)';
			// The message and the stack are indented, so no line of them can equal this block's own markers.
			console.log(
				[
					`--- error: start ${start}, call ${call}`,
					`class: ${name}`,
					'message:',
					indent(message),
					'stack:',
					indent(stack),
					'--- end of error'
				].join('\n')
			);
			return undefined;
		}
	}

	const catalogue = await attempt('loadCatalogue', () => loadCatalogue(contentDir));
	const db = createDb(databaseUrl);
	const finish = async (): Promise<never> => {
		await db.$disconnect();
		console.log(
			[
				CHILD_LAST_LINE.trim(),
				`calls=${calls}`,
				`core-calls=${coreCalls}`,
				`errors=${errors}`,
				`other-errors=${otherErrors}`,
				`query-engine=${queryEngine}`,
				...list(classes),
				...list(refusals).map((entry) => `${REFUSED}${entry}`)
			].join(' ')
		);
		process.exit(queryEngine > 0 ? 1 : otherErrors > 0 || coreCalls === 0 ? 2 : 0);
	};
	if (!catalogue) return finish();

	// The start read of the Instance row, once per process as `createApp` does it.
	const instance = await attempt('createInstance', () => createInstance(db));
	if (!instance) return finish();
	let fresh = false;
	await attempt('the copied database has no mode', async () => {
		if (instance.mode() !== null) throw new Error('the copied database already has a mode');
		fresh = true;
	});
	if (!fresh) return finish();
	const local = await createLocalIdentity(db);
	const identity = createIdentity({ instance, local, multi: null });

	// What the server's hook does first on every request.
	const event: ResolveEvent = {
		cookies: { get: () => undefined },
		request: { headers: new Headers() }
	};
	const resolve = (call: string) => attempt(call, () => identity.resolve(event));

	// One request before Setup: it answers nobody.
	await resolve('identity.resolve (before Setup)');

	// Setup's Local choice, as `createApp`'s wrapper reaches it.
	const chosen = await attempt('instance.chooseLocal', async () => {
		await instance.chooseLocal();
		await local.ensureLocalLearner();
		return true;
	});
	if (!chosen) return finish();

	const core = createLearningCore({
		catalogue,
		db,
		runner: createCatalogueScriptedRunner(catalogue)
	});

	/** One request as `handle.ts` makes it: who is it, then one Learning-core call for that Learner. */
	async function request<T>(call: string, make: (learner: Learner) => Promise<T>) {
		const answer = await resolve(`identity.resolve (${call})`);
		if (answer?.kind !== 'resolved' || !answer.who) return undefined;
		const learner = core.forLearner(answer.who.learnerId);
		return attempt(call, () => make(learner), true);
	}

	const TOPIC = 'dynamic-arrays';
	const CHAPTER = 'dynamic-arrays-cpython-list';
	const PROBLEM = 'dynamic-arrays-append';

	await request('map', (l) => l.map());
	await request(`topic ${TOPIC}`, (l) => l.topic(TOPIC));
	await request(`chapter ${CHAPTER}`, (l) => l.chapter(CHAPTER));
	await request(`reachChapterEnd ${CHAPTER}`, (l) => l.reachChapterEnd(CHAPTER));

	// A hover preload and the navigation can both load the Problem page.
	const [first, second] = await Promise.all([
		request('problem (1 of 2 at once)', (l) => l.problem(PROBLEM)),
		request('problem (2 of 2 at once)', (l) => l.problem(PROBLEM))
	]);
	let view = first ?? second;

	const reference = catalogue.problem(PROBLEM)?.referenceCode;
	for (const [index, language] of LANGUAGES.entries()) {
		if (index > 0) {
			await request(`switchLanguage ${language.id}`, (l) => l.switchLanguage(PROBLEM, language.id));
			view = await request(`problem (after switching to ${language.id})`, (l) =>
				l.problem(PROBLEM)
			);
		}
		const files = reference?.[language.id];
		if (!view || !files) continue;
		const build = view.build;
		const saved = await request(`saveCode ${language.id}`, (l) => l.saveCode(build, { ...files }));
		if (!saved) continue;
		const ran = await request(`run ${language.id}`, (l) =>
			l.run({ ...build, revision: saved.revision }, { ...files })
		);
		if (!ran) continue;
		await request(`submit ${language.id}`, (l) =>
			l.submit({ ...build, revision: ran.revision }, { ...files })
		);
	}

	await request(`topic ${TOPIC} (again)`, (l) => l.topic(TOPIC));
	return finish();
}

// ---------------------------------------------------------------------------------------------------------------
// The parent: one child per start

interface Outcome {
	exitCode: number | null;
	signal: string | null;
	timedOut: boolean;
	output: string;
}

/** What the parent must clean up if it is stopped: the live child and the current database copy. */
let liveChild: ChildProcess | null = null;
let liveFolder: string | null = null;

function cleanUp() {
	try {
		liveChild?.kill('SIGKILL');
	} catch {
		// Already gone.
	}
	if (liveFolder) rmSync(liveFolder, { recursive: true, force: true });
	liveChild = null;
	liveFolder = null;
}

/** The first and the last part of a child's output; the middle is drained and counted, never kept. */
class Capture {
	private head = Buffer.alloc(0);
	private tail = Buffer.alloc(0);
	private total = 0;
	push(chunk: Buffer) {
		this.total += chunk.length;
		let rest = chunk;
		if (this.head.length < KEEP_HEAD) {
			const room = KEEP_HEAD - this.head.length;
			this.head = Buffer.concat([this.head, rest.subarray(0, room)]);
			rest = rest.subarray(room);
		}
		if (rest.length > 0) this.tail = Buffer.concat([this.tail, rest]).subarray(-KEEP_TAIL);
	}
	text(): string {
		const dropped = this.total - this.head.length - this.tail.length;
		const note =
			dropped > 0 ? `\n${TRUNCATED}${dropped} bytes of the child's output left out]\n` : '';
		return this.head.toString('utf8') + note + this.tail.toString('utf8');
	}
}
const TRUNCATED = '[output truncated: ';

function runChild(start: number, databaseUrl: string): Promise<Outcome> {
	return new Promise((resolveOutcome) => {
		const env: Record<string, string> = { DATABASE_URL: databaseUrl };
		for (const name of CHILD_ENV) {
			const value = process.env[name];
			if (value !== undefined) env[name] = value;
		}
		const proc = spawn(process.execPath, [process.argv[1] as string, CHILD_FLAG, String(start)], {
			env,
			stdio: ['ignore', 'pipe', 'pipe']
		});
		liveChild = proc;
		const capture = new Capture();
		let timedOut = false;
		let settled = false;
		const settle = (exitCode: number | null, signal: string | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			liveChild = null;
			resolveOutcome({ exitCode, signal, timedOut, output: capture.text() });
		};
		const timer = setTimeout(() => {
			timedOut = true;
			proc.kill('SIGKILL');
		}, DEADLINE_MS);
		proc.stdout.on('data', (chunk: Buffer) => capture.push(chunk));
		proc.stderr.on('data', (chunk: Buffer) => capture.push(chunk));
		proc.on('error', () => settle(null, 'spawn-error'));
		// A grandchild may hold a pipe open after the child is gone, so `close` alone could wait for ever.
		proc.on('exit', (exitCode, signal) => {
			setTimeout(() => settle(exitCode, signal), GRACE_MS);
		});
		proc.on('close', (exitCode, signal) => settle(exitCode, signal));
	});
}

/** The numbers a complete child summary must carry; anything else on it is a class or a refusal. */
const REQUIRED = ['calls', 'core-calls', 'errors', 'other-errors', 'query-engine'] as const;

/** The child's last line as numbers, or null when a number the parent needs is missing or not a count. */
function parseSummary(last: string): Map<string, number> | null {
	if (!last.startsWith(CHILD_LAST_LINE)) return null;
	const found = new Map<string, number>();
	for (const token of last.slice(CHILD_LAST_LINE.length).split(' ')) {
		const at = token.indexOf('=');
		const value = token.slice(at + 1);
		if (at < 1 || !/^[0-9]{1,9}$/.test(value)) return null;
		found.set(token.slice(0, at), Number(value));
	}
	return REQUIRED.every((key) => found.has(key)) ? found : null;
}

/**
 * A child's lines as they are printed: a block cut by the omitted middle is closed before the note, and a line that
 * starts the parent's own summary is indented, so nothing a child printed can stand in for it.
 */
function printable(lines: string[]): string[] {
	const out: string[] = [];
	let inBlock = false;
	for (const line of lines) {
		if (line.startsWith(TRUNCATED) && inBlock) {
			out.push('--- end of error');
			inBlock = false;
		}
		if (line.startsWith('--- error:')) inBlock = true;
		if (line.startsWith('--- end of error')) inBlock = false;
		out.push(line.startsWith(AGGREGATE_PREFIX) ? `  ${line}` : line);
	}
	if (inBlock) out.push('--- end of error');
	return out;
}

/** The one place the number of starts is read: digits only, no leading zero, 1 to 2000, or null. */
function parseStarts(raw: string | undefined): number | null {
	if (raw === undefined || !/^[1-9][0-9]{0,3}$/.test(raw)) return null;
	const value = Number(raw);
	return value <= 2000 ? value : null;
}

async function runParent(): Promise<void> {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error('DATABASE_URL is not set');
	if (!process.env.CONTENT_DIR) throw new Error('CONTENT_DIR is not set');
	if (!databaseUrl.startsWith('file:')) throw new Error('DATABASE_URL must be a file: URL');
	// Never echoes the value: it is not trusted to be one line.
	const starts = parseStarts(process.env.FRESH_STARTS);
	if (starts === null) {
		throw new Error(
			'FRESH_STARTS must be a whole number from 1 to 2000, written without a leading zero'
		);
	}
	const template = databaseUrl.slice('file:'.length);

	for (const [signal, code] of [
		['SIGINT', 130],
		['SIGTERM', 143]
	] as const) {
		process.on(signal, () => {
			cleanUp();
			process.exit(code);
		});
	}

	let calls = 0;
	let errors = 0;
	let failed = 0;
	let notPrinted = 0;
	let blockStarts = 0;
	let timeoutsInARow = 0;
	let notRun = 0;
	let queryEngineSeen = false;
	const classes = new Map<string, number>();
	const refusals = new Map<string, number>();

	for (let start = 1; start <= starts; start++) {
		liveFolder = mkdtempSync(join(tmpdir(), 'fresh-start-'));
		let outcome: Outcome;
		try {
			const copy = join(liveFolder, 'fresh.db');
			copyFileSync(template, copy);
			outcome = await runChild(start, `file:${copy}`);
		} finally {
			rmSync(liveFolder, { recursive: true, force: true });
			liveFolder = null;
		}

		const lines = outcome.output.split('\n');
		while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop();
		const summary = parseSummary(lines.at(-1) ?? '');
		const engine = summary?.get('query-engine') ?? 0;
		if (summary) {
			calls += summary.get('calls') ?? 0;
			errors += summary.get('errors') ?? 0;
			for (const [key, count] of summary) {
				if ((REQUIRED as readonly string[]).includes(key)) continue;
				if (key.startsWith(REFUSED)) bump(refusals, key.slice(REFUSED.length), count);
				else bump(classes, key, count);
			}
		}
		if (engine > 0) queryEngineSeen = true;

		const clean = outcome.timedOut || outcome.signal !== null ? null : outcome.exitCode;
		// A start fails when it was cut short, its summary is incomplete, or it caught an error that is not a
		// refusal and not a query-engine error (those are counted as errors and fail the run themselves), or it
		// asked the Learning core nothing.
		const failedStart =
			outcome.timedOut ||
			outcome.signal !== null ||
			summary === null ||
			(summary.get('other-errors') ?? 0) > 0 ||
			(summary.get('core-calls') ?? 0) === 0 ||
			(clean !== 0 && engine === 0);
		const hasBlocks = lines.some((line) => line.startsWith('--- error:'));
		if (failedStart) failed++;
		if (hasBlocks || failedStart) blockStarts++;
		const shown = printable(lines);
		if (!hasBlocks && !failedStart) {
			console.log(shown.slice(-5).join('\n'));
		} else if (blockStarts <= PRINTED_STARTS) {
			console.log(shown.join('\n'));
			if (failedStart) {
				const how = outcome.timedOut
					? `timed out after ${DEADLINE_MS / 1000} s and killed`
					: outcome.signal !== null
						? `killed by signal ${outcome.signal}`
						: `exit code ${outcome.exitCode}`;
				// The child's own lines sit behind a prefix, so none can stand for a marker or for a summary.
				const lastLines = lines.slice(-20).map((line) => `    | ${line.slice(0, 500)}`);
				console.log(
					[`--- error: start ${start}, process`, how, ...lastLines, '--- end of error'].join('\n')
				);
			}
		} else {
			notPrinted++;
			console.log(shown.slice(-1).join('\n'));
		}

		timeoutsInARow = outcome.timedOut ? timeoutsInARow + 1 : 0;
		if (timeoutsInARow >= MAX_TIMEOUTS_IN_A_ROW && start < starts) {
			notRun = starts - start;
			console.log(
				[
					`--- error: start ${start}, stopped`,
					`stopped after ${MAX_TIMEOUTS_IN_A_ROW} timed-out starts in a row; ${notRun} starts did not run`,
					'--- end of error'
				].join('\n')
			);
			break;
		}
	}

	if (refusals.size > 0) console.log(`${REFUSALS_LINE}${list(refusals).join(' ')}`);
	console.log(
		[
			'prisma-fresh-start',
			`starts=${starts}`,
			`calls=${calls}`,
			`errors=${errors}`,
			`failed-starts=${failed}`,
			`not-printed=${notPrinted}`,
			...(notRun > 0 ? [`not-run=${notRun}`] : []),
			...list(classes)
		].join(' ')
	);
	process.exit(queryEngineSeen || failed > 0 ? 1 : 0);
}

if (process.argv[2] === CHILD_FLAG) await child(Number(process.argv[3]));
else await runParent();
