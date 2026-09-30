import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { z } from 'zod';
import {
	chapterManifest,
	contentManifest,
	LANGUAGES,
	type Language,
	problemManifest,
	topicManifest
} from './schema.ts';

export { LANGUAGES, type Language };

export interface TopicSummary {
	readonly id: string;
	readonly title: string;
	readonly summary: string;
	readonly prerequisites: readonly string[];
}

export interface ProblemSummary {
	readonly id: string;
	readonly title: string;
	readonly kind: 'core' | 'extra';
	/** For an Extra Problem: the Core Problem it branches off. */
	readonly parent?: string;
}

export interface ChapterSummary {
	readonly id: string;
	readonly title: string;
	readonly problems: readonly ProblemSummary[];
}

export interface Topic extends TopicSummary {
	readonly chapters: readonly ChapterSummary[];
	/** The Topic's Core Problem ids, in order. */
	readonly mainLine: readonly string[];
}

export interface Chapter extends ChapterSummary {
	readonly topicId: string;
	/** Markdown prose. */
	readonly body: string;
}

export interface Test {
	/** Unique across the catalogue: `<problemId>/<kind>/<name>`. */
	readonly id: string;
	readonly kind: 'example' | 'hidden';
	/** Given to the program on stdin. */
	readonly input: string;
	/** The expected stdout, byte for byte as authored. */
	readonly expected: string;
}

/** A Build: file contents keyed by path relative to the Build root, `/`-separated. */
export type BuildFiles = Readonly<Record<string, string>>;

export interface Problem extends ProblemSummary {
	readonly topicId: string;
	readonly chapterId: string;
	/** Markdown. */
	readonly statement: string;
	readonly exampleTests: readonly Test[];
	/** Markdown, in reveal order. */
	readonly hints: readonly string[];
	/** The Solution explanation, Markdown. The Solution's code is `referenceCode`. */
	readonly solution: string;
	/** The Build after this Problem, in every Language. */
	readonly referenceCode: Readonly<Record<Language, BuildFiles>>;
}

export interface Catalogue {
	/** Every Topic, in content order, with its Prerequisites. */
	topicMap(): readonly TopicSummary[];
	topic(id: string): Topic | undefined;
	chapter(id: string): Chapter | undefined;
	/** A Problem without its Hidden Tests, safe to hand to a view. */
	problem(id: string): Problem | undefined;
	/** The Problem's Hidden Tests. Keep them on the server. */
	hiddenTests(problemId: string): readonly Test[] | undefined;
}

/** Content failed validation. `issues` lists every problem found, each prefixed with its path. */
export class ContentError extends Error {
	constructor(readonly issues: readonly string[]) {
		super(`Invalid content, ${issues.length} issue(s):\n${issues.map((i) => `- ${i}`).join('\n')}`);
		this.name = 'ContentError';
	}
}

/** Loads and validates the content folder at `dir`, or throws a ContentError. */
export async function loadCatalogue(dir: string): Promise<Catalogue> {
	const issues: string[] = [];
	const report = (path: string, message: string) =>
		issues.push(`${relative(dir, path).split(sep).join('/')}: ${message}`);

	async function readText(path: string): Promise<string> {
		try {
			return await readFile(path, 'utf8');
		} catch {
			report(path, 'missing file');
			return '';
		}
	}

	async function readJson<T>(path: string, schema: z.ZodType<T>): Promise<T | undefined> {
		let json: unknown;
		try {
			json = JSON.parse(await readFile(path, 'utf8'));
		} catch (error) {
			report(path, error instanceof SyntaxError ? 'not valid JSON' : 'missing file');
			return undefined;
		}
		const result = schema.safeParse(json);
		if (!result.success) report(path, z.prettifyError(result.error));
		return result.data;
	}

	async function readTests(problemDir: string, problemId: string, kind: Test['kind']) {
		const testDir = join(problemDir, 'tests', kind);
		const names = new Set<string>();
		for (const file of await listFiles(testDir)) {
			const match = /^(.+)\.(in|out)$/.exec(file);
			if (match) names.add(match[1]);
			else report(join(testDir, file), 'expected a .in or .out file');
		}
		if (kind === 'example' && names.size === 0) report(testDir, 'needs at least one Example Test');
		return Promise.all(
			[...names].sort().map(
				async (name): Promise<Test> => ({
					id: `${problemId}/${kind}/${name}`,
					kind,
					input: await readText(join(testDir, `${name}.in`)),
					expected: await readText(join(testDir, `${name}.out`))
				})
			)
		);
	}

	async function readHints(hintDir: string): Promise<string[]> {
		const files = await listFiles(hintDir);
		const expected = files.map((_, i) => `${i + 1}.md`);
		if (!expected.every((f) => files.includes(f))) {
			const found = files.sort((x, y) => x.localeCompare(y, 'en', { numeric: true }));
			report(
				hintDir,
				`Hints must be 1.md to ${files.length}.md in order, found ${found.join(', ')}`
			);
			return [];
		}
		return Promise.all(expected.map((f) => readText(join(hintDir, f))));
	}

	async function readReferenceCode(referenceDir: string) {
		for (const folder of await listDirs(referenceDir)) {
			if (!(LANGUAGES as readonly string[]).includes(folder)) {
				report(referenceDir, `"${folder}" is not a Language (${LANGUAGES.join(', ')})`);
			}
		}
		const code = {} as Record<Language, BuildFiles>;
		for (const language of LANGUAGES) {
			const languageDir = join(referenceDir, language);
			const paths = (await listFiles(languageDir, true)).sort();
			if (paths.length === 0) report(languageDir, 'missing Reference Code');
			const files: Record<string, string> = {};
			for (const path of paths) {
				files[path.split(sep).join('/')] = await readText(join(languageDir, path));
			}
			code[language] = files;
		}
		return code;
	}

	const owners = new Map<string, string>();
	/** Ids are unique across Topics, Chapters and Problems. */
	function claimId(id: string, path: string) {
		const owner = owners.get(id);
		if (owner === undefined) owners.set(id, path);
		else report(path, `id "${id}" is already used by ${relative(dir, owner).split(sep).join('/')}`);
	}

	/** A manifest lists exactly the folders beside it. */
	async function checkListed(parentDir: string, listed: readonly string[], manifest: string) {
		for (const folder of await listDirs(parentDir)) {
			if (!listed.includes(folder))
				report(parentDir, `folder "${folder}" is not listed in ${manifest}`);
		}
	}

	const topics = new Map<string, Topic>();
	const chapters = new Map<string, Chapter>();
	const problems = new Map<string, Problem>();
	const hidden = new Map<string, Test[]>();

	const content = await readJson(join(dir, 'content.json'), contentManifest);
	if (content) await checkListed(join(dir, 'topics'), content.topics, 'content.json');
	for (const topicId of content?.topics ?? []) {
		const topicDir = join(dir, 'topics', topicId);
		claimId(topicId, topicDir);
		const topic = await readJson(join(topicDir, 'topic.json'), topicManifest);
		if (!topic) continue;
		await checkListed(join(topicDir, 'chapters'), topic.chapters, 'topic.json');
		const topicChapters: Chapter[] = [];

		for (const chapterId of topic.chapters) {
			const chapterDir = join(topicDir, 'chapters', chapterId);
			claimId(chapterId, chapterDir);
			const chapter = await readJson(join(chapterDir, 'chapter.json'), chapterManifest);
			if (!chapter) continue;
			await checkListed(join(chapterDir, 'problems'), chapter.problems, 'chapter.json');
			const summaries: ProblemSummary[] = [];

			for (const problemId of chapter.problems) {
				const problemDir = join(chapterDir, 'problems', problemId);
				claimId(problemId, problemDir);
				const manifest = await readJson(join(problemDir, 'problem.json'), problemManifest);
				if (!manifest) continue;
				summaries.push({ id: problemId, ...manifest });
				problems.set(problemId, {
					id: problemId,
					...manifest,
					topicId,
					chapterId,
					statement: await readText(join(problemDir, 'statement.md')),
					exampleTests: await readTests(problemDir, problemId, 'example'),
					hints: await readHints(join(problemDir, 'hints')),
					solution: await readText(join(problemDir, 'solution.md')),
					referenceCode: await readReferenceCode(join(problemDir, 'reference'))
				});
				hidden.set(problemId, await readTests(problemDir, problemId, 'hidden'));
			}

			const loaded: Chapter = {
				id: chapterId,
				topicId,
				title: chapter.title,
				body: await readText(join(chapterDir, 'chapter.md')),
				problems: summaries
			};
			chapters.set(chapterId, loaded);
			topicChapters.push(loaded);
		}

		topics.set(topicId, {
			id: topicId,
			title: topic.title,
			summary: topic.summary,
			prerequisites: topic.prerequisites,
			chapters: topicChapters.map(({ id, title, problems }) => ({ id, title, problems })),
			mainLine: topicChapters.flatMap((c) =>
				c.problems.filter((p) => p.kind === 'core').map((p) => p.id)
			)
		});
	}

	if (issues.length > 0) throw new ContentError(issues);

	const topicMap = [...topics.values()].map(({ id, title, summary, prerequisites }) => ({
		id,
		title,
		summary,
		prerequisites
	}));
	deepFreeze([topicMap, topics, chapters, problems, hidden]);

	return {
		topicMap: () => topicMap,
		topic: (id) => topics.get(id),
		chapter: (id) => chapters.get(id),
		problem: (id) => problems.get(id),
		hiddenTests: (problemId) => hidden.get(problemId)
	};
}

/** Names of the subfolders of `dir`; empty when `dir` does not exist. */
async function listDirs(dir: string): Promise<string[]> {
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		return entries.filter((e) => e.isDirectory()).map((e) => e.name);
	} catch {
		return [];
	}
}

/** Relative paths of the regular files in `dir`; empty when `dir` does not exist. */
async function listFiles(dir: string, recursive = false): Promise<string[]> {
	let entries: string[];
	try {
		entries = await readdir(dir, { recursive });
	} catch {
		return [];
	}
	const isFile = await Promise.all(entries.map(async (e) => (await stat(join(dir, e))).isFile()));
	return entries.filter((_, i) => isFile[i]);
}

function deepFreeze(value: unknown): void {
	if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return;
	if (value instanceof Map) {
		for (const v of value.values()) deepFreeze(v);
		return;
	}
	Object.freeze(value);
	for (const v of Object.values(value)) deepFreeze(v);
}
