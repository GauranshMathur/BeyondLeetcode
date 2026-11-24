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
 * and `<class>=<count>` for each class. Exit 1 when any start saw a `PrismaClient*` error or failed, 0 otherwise.
 * A refusal of the Learning core is counted by code and is not an error.
 */
import { spawn } from 'node:child_process';
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
/** Starts whose error blocks are printed in full; the rest are only counted. */
const PRINTED_STARTS = 50;
const CHILD_LAST_LINE = 'prisma-fresh-start-child ';
const REFUSALS_LINE = 'learning-core refusals (not errors) ';
/** A refusal's code on a child's last line, so it is not read as an error class. */
const REFUSED = 'refused-';

const bump = (counts: Map<string, number>, key: string, by = 1) =>
	counts.set(key, (counts.get(key) ?? 0) + by);

const list = (counts: Map<string, number>) => [...counts].map(([k, v]) => `${k}=${v}`);

// ---------------------------------------------------------------------------------------------------------------
// The child: one fresh process, one start

async function child(start: number): Promise<never> {
	const databaseUrl = process.env.DATABASE_URL;
	const contentDir = process.env.CONTENT_DIR;
	if (!databaseUrl) throw new Error('DATABASE_URL is not set');
	if (!contentDir) throw new Error('CONTENT_DIR is not set');

	let calls = 0;
	let errors = 0;
	let queryEngine = 0;
	let setupBroken = false;
	const classes = new Map<string, number>();
	const refusals = new Map<string, number>();

	/** The class name `web` would log for this thrown value. */
	const className = (error: unknown): string => {
		if (!(error instanceof Error)) return typeof error;
		if (error.name && error.name !== 'Error') return error.name;
		return error.constructor?.name || 'Error';
	};

	/** Makes one call and catches whatever it throws; the answer is undefined when it threw. */
	async function attempt<T>(call: string, make: () => Promise<T>): Promise<T | undefined> {
		calls++;
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
			const message = error instanceof Error ? error.message : String(error);
			const stack = error instanceof Error ? (error.stack ?? '(no stack)') : '(not an Error)';
			console.log(
				[
					`--- error: start ${start}, call ${call}`,
					`class: ${name}`,
					`message: ${message}`,
					'stack:',
					stack,
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
				`errors=${errors}`,
				`query-engine=${queryEngine}`,
				...list(classes),
				...list(refusals).map((entry) => `${REFUSED}${entry}`)
			].join(' ')
		);
		process.exit(queryEngine > 0 ? 1 : setupBroken ? 2 : 0);
	};
	if (!catalogue) return finish();

	// The start read of the Instance row, once per process as `createApp` does it.
	const instance = await attempt('createInstance', () => createInstance(db));
	if (!instance) return finish();
	if (instance.mode() !== null) {
		setupBroken = true;
		console.log(
			`--- error: start ${start}, call createInstance\nclass: NotFresh\nmessage: the copied database already has a mode\nstack:\n(none)\n--- end of error`
		);
		errors++;
		bump(classes, 'NotFresh');
		return finish();
	}
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

	/** A request as `handle.ts` makes it: who is it, then the Learner's view. */
	async function learnerOf(call: string): Promise<Learner | undefined> {
		const answer = await resolve(`identity.resolve (${call})`);
		if (answer?.kind !== 'resolved' || !answer.who) return undefined;
		return core.forLearner(answer.who.learnerId);
	}
	/** One request: resolve, then one Learning-core call. */
	async function request<T>(call: string, make: (learner: Learner) => Promise<T>) {
		const learner = await learnerOf(call);
		if (!learner) return undefined;
		return attempt(call, () => make(learner));
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
		const learner = await learnerOf(`${language.id} build`);
		if (!learner) break;
		if (index > 0) {
			await attempt(`switchLanguage ${language.id}`, () =>
				learner.switchLanguage(PROBLEM, language.id)
			);
			view = await attempt(`problem (after switching to ${language.id})`, () =>
				learner.problem(PROBLEM)
			);
		}
		const files = reference?.[language.id];
		if (!view || !files) continue;
		const build = view.build;
		const saved = await attempt(`saveCode ${language.id}`, () =>
			learner.saveCode(build, { ...files })
		);
		if (!saved) continue;
		const ran = await attempt(`run ${language.id}`, () =>
			learner.run({ ...build, revision: saved.revision }, { ...files })
		);
		if (!ran) continue;
		await attempt(`submit ${language.id}`, () =>
			learner.submit({ ...build, revision: ran.revision }, { ...files })
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

function runChild(start: number, databaseUrl: string): Promise<Outcome> {
	return new Promise((resolveOutcome) => {
		const proc = spawn(process.execPath, [process.argv[1] as string, CHILD_FLAG, String(start)], {
			env: { ...process.env, DATABASE_URL: databaseUrl },
			stdio: ['ignore', 'pipe', 'pipe']
		});
		let output = '';
		let timedOut = false;
		const take = (chunk: Buffer) => {
			output += chunk.toString('utf8');
		};
		proc.stdout.on('data', take);
		proc.stderr.on('data', take);
		const timer = setTimeout(() => {
			timedOut = true;
			proc.kill('SIGKILL');
		}, DEADLINE_MS);
		proc.on('error', (error) => {
			output += `\n(could not start the child: ${error.message})\n`;
		});
		proc.on('close', (exitCode, signal) => {
			clearTimeout(timer);
			resolveOutcome({ exitCode, signal, timedOut, output });
		});
	});
}

/** The output with every `--- error:` ... `--- end of error` block taken out. */
function withoutErrorBlocks(output: string): string {
	const kept: string[] = [];
	let inBlock = false;
	for (const line of output.split('\n')) {
		if (line.startsWith('--- error:')) inBlock = true;
		if (!inBlock) kept.push(line);
		if (line.startsWith('--- end of error')) inBlock = false;
	}
	return kept.join('\n');
}

async function runParent(): Promise<void> {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error('DATABASE_URL is not set');
	if (!process.env.CONTENT_DIR) throw new Error('CONTENT_DIR is not set');
	if (!databaseUrl.startsWith('file:')) throw new Error('DATABASE_URL must be a file: URL');
	const starts = Number(process.env.FRESH_STARTS ?? '');
	if (!Number.isInteger(starts) || starts < 1) {
		throw new Error('FRESH_STARTS must be a whole number of at least 1');
	}
	const template = databaseUrl.slice('file:'.length);

	let calls = 0;
	let errors = 0;
	let failed = 0;
	let notPrinted = 0;
	let startsWithErrors = 0;
	let queryEngineSeen = false;
	const classes = new Map<string, number>();
	const refusals = new Map<string, number>();

	for (let start = 1; start <= starts; start++) {
		const folder = mkdtempSync(join(tmpdir(), 'fresh-start-'));
		let outcome: Outcome;
		try {
			const copy = join(folder, 'fresh.db');
			copyFileSync(template, copy);
			outcome = await runChild(start, `file:${copy}`);
		} finally {
			rmSync(folder, { recursive: true, force: true });
		}

		const lines = outcome.output.split('\n');
		while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop();
		const last = lines.at(-1) ?? '';
		const summary = last.startsWith(CHILD_LAST_LINE) ? last.slice(CHILD_LAST_LINE.length) : null;
		let childEngine = 0;
		if (summary !== null) {
			for (const token of summary.split(' ')) {
				const [key, value] = token.split('=');
				const count = Number(value);
				if (!key || !Number.isFinite(count)) continue;
				if (key === 'calls') calls += count;
				else if (key === 'errors') errors += count;
				else if (key === 'query-engine') childEngine = count;
				else if (key.startsWith(REFUSED)) bump(refusals, key.slice(REFUSED.length), count);
				else bump(classes, key, count);
			}
		}
		if (childEngine > 0) queryEngineSeen = true;

		const hasBlocks = lines.some((line) => line.startsWith('--- error:'));
		if (hasBlocks) startsWithErrors++;
		const text = lines.join('\n');
		if (hasBlocks && startsWithErrors > PRINTED_STARTS) {
			notPrinted++;
			const rest = withoutErrorBlocks(text);
			if (rest.trim() !== '') console.log(rest);
		} else if (text !== '') {
			console.log(text);
		}

		const exited = !outcome.timedOut && outcome.signal === null ? outcome.exitCode : null;
		const failedStart =
			outcome.timedOut ||
			outcome.signal !== null ||
			summary === null ||
			(exited !== 0 && childEngine === 0);
		if (failedStart) {
			failed++;
			const how = outcome.timedOut
				? `timed out after ${DEADLINE_MS / 1000} s and killed`
				: outcome.signal !== null
					? `killed by signal ${outcome.signal}`
					: `exit code ${outcome.exitCode}`;
			console.log(
				[`--- error: start ${start}, process`, how, ...lines.slice(-20), '--- end of error'].join(
					'\n'
				)
			);
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
			...list(classes)
		].join(' ')
	);
	process.exit(queryEngineSeen || failed > 0 ? 1 : 0);
}

if (process.argv[2] === CHILD_FLAG) await child(Number(process.argv[3]));
else await runParent();
