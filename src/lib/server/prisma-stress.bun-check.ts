/**
 * Run under Bun, not vitest, on a database already migrated with `bunx prisma migrate deploy`:
 *
 *   DATABASE_URL=file:/tmp/stress.db CONTENT_DIR=content STRESS_ROUNDS=200 bun src/lib/server/prisma-stress.bun-check.ts
 *
 * It drives the calls the image smoke flow makes on its first Problem, round after round, through the same
 * functions `createApp` uses for a Local Instance (the catalogue, `createDb`, the Learning core), and prints every
 * error in full: the call, the error's class name, its message and its stack. `web` logs only a class name, so this
 * is where a query-engine failure shows what it was. The script prints messages on purpose, which is safe only
 * because it runs on the bundled content and a throwaway database with generated values, in CI.
 *
 * It uses the scripted catalogue Runner, so no Docker is needed, and it does not call `createApp`, which refuses
 * that Runner when NODE_ENV is production (the image sets it).
 *
 * The last line is `prisma-stress rounds=<n> calls=<n> errors=<n>` and `<class>=<count>` for each class. Exit 1 when
 * any error's class name starts with `PrismaClient`, 0 otherwise. A refusal of the Learning core (NotFound,
 * TopicLocked, RevisionConflict, InvalidBuild, RunnerUnavailable) is counted by code and is not an error: two calls
 * made at once may be refused by design.
 */
import { loadCatalogue } from './content/catalogue.ts';
import { createDb } from './db.ts';
import { createLearningCore, LearningError } from './learning/core.ts';
import { createCatalogueScriptedRunner } from './runner/scripted-catalogue.ts';

const PROBLEM_ID = 'dynamic-arrays-append';

const databaseUrl = process.env.DATABASE_URL;
const contentDir = process.env.CONTENT_DIR;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');
if (!contentDir) throw new Error('CONTENT_DIR is not set');
const rounds = Number(process.env.STRESS_ROUNDS ?? '200');
if (!Number.isInteger(rounds) || rounds < 1) {
	throw new Error('STRESS_ROUNDS must be a whole number of at least 1');
}

const catalogue = await loadCatalogue(contentDir);
const db = createDb(databaseUrl);
const core = createLearningCore({
	catalogue,
	db,
	runner: createCatalogueScriptedRunner(catalogue)
});

const reference = catalogue.problem(PROBLEM_ID)?.referenceCode.python;
if (!reference) throw new Error(`${PROBLEM_ID} has no Python Reference Code in ${contentDir}`);
const files = { ...reference };

let calls = 0;
let errors = 0;
const errorClasses = new Map<string, number>();
const refusals = new Map<string, number>();
let queryEngineErrors = 0;

const bump = (counts: Map<string, number>, key: string) =>
	counts.set(key, (counts.get(key) ?? 0) + 1);

/** The class name `web` would log for this thrown value. */
function className(error: unknown): string {
	if (!(error instanceof Error)) return typeof error;
	if (error.name && error.name !== 'Error') return error.name;
	return error.constructor?.name || 'Error';
}

/** Makes one call and catches whatever it throws; the answer is undefined when it threw. */
async function attempt<T>(
	round: number,
	call: string,
	make: () => Promise<T>
): Promise<T | undefined> {
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
		bump(errorClasses, name);
		if (name.startsWith('PrismaClient')) queryEngineErrors++;
		const message = error instanceof Error ? error.message : String(error);
		const stack = error instanceof Error ? (error.stack ?? '(no stack)') : '(not an Error)';
		console.log(
			[
				`--- error: round ${round}, call ${call}`,
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

for (let round = 1; round <= rounds; round++) {
	const created = await attempt(round, 'learner.create', () => db.learner.create({ data: {} }));
	if (!created) continue;
	const learner = core.forLearner(created.id);

	// A hover preload and the navigation can both load the Problem page.
	const [first, second] = await Promise.all([
		attempt(round, 'problem (1 of 2 at once)', () => learner.problem(PROBLEM_ID)),
		attempt(round, 'problem (2 of 2 at once)', () => learner.problem(PROBLEM_ID))
	]);
	const view = first ?? second;
	if (!view) continue;

	const build = view.build;
	const saved = await attempt(round, 'saveCode', () => learner.saveCode(build, files));
	if (!saved) continue;
	const ran = await attempt(round, 'run', () =>
		learner.run({ ...build, revision: saved.revision }, files)
	);
	if (!ran) continue;
	const submitted = await attempt(round, 'submit', () =>
		learner.submit({ ...build, revision: ran.revision }, files)
	);
	if (!submitted) continue;

	const at = { ...build, revision: submitted.revision };
	await Promise.all([
		attempt(round, 'submit (at once with saveCode)', () => learner.submit(at, files)),
		attempt(round, 'saveCode (at once with submit)', () => learner.saveCode(at, files))
	]);
}

await db.$disconnect();

if (refusals.size > 0) {
	const list = [...refusals].map(([code, count]) => `${code}=${count}`).join(' ');
	console.log(`learning-core refusals (not errors) ${list}`);
}
const classes = [...errorClasses].map(([name, count]) => `${name}=${count}`);
console.log(
	['prisma-stress', `rounds=${rounds}`, `calls=${calls}`, `errors=${errors}`, ...classes].join(' ')
);
process.exit(queryEngineErrors > 0 ? 1 : 0);
