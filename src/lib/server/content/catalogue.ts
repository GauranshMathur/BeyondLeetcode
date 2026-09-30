import { readdir, readFile, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import type { z } from 'zod';
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

export async function loadCatalogue(dir: string): Promise<Catalogue> {
	const content = await readJson(join(dir, 'content.json'), contentManifest);
	const topics = new Map<string, Topic>();
	const chapters = new Map<string, Chapter>();
	const problems = new Map<string, Problem>();
	const hidden = new Map<string, Test[]>();

	for (const topicId of content.topics) {
		const topicDir = join(dir, 'topics', topicId);
		const topic = await readJson(join(topicDir, 'topic.json'), topicManifest);
		const topicChapters: Chapter[] = [];

		for (const chapterId of topic.chapters) {
			const chapterDir = join(topicDir, 'chapters', chapterId);
			const chapter = await readJson(join(chapterDir, 'chapter.json'), chapterManifest);
			const summaries: ProblemSummary[] = [];

			for (const problemId of chapter.problems) {
				const problemDir = join(chapterDir, 'problems', problemId);
				const manifest = await readJson(join(problemDir, 'problem.json'), problemManifest);
				summaries.push({ id: problemId, ...manifest });
				problems.set(problemId, {
					id: problemId,
					...manifest,
					topicId,
					chapterId,
					statement: await readFile(join(problemDir, 'statement.md'), 'utf8'),
					exampleTests: await readTests(problemDir, problemId, 'example'),
					hints: await readHints(join(problemDir, 'hints')),
					solution: await readFile(join(problemDir, 'solution.md'), 'utf8'),
					referenceCode: await readReferenceCode(join(problemDir, 'reference'))
				});
				hidden.set(problemId, await readTests(problemDir, problemId, 'hidden'));
			}

			const loaded: Chapter = {
				id: chapterId,
				topicId,
				title: chapter.title,
				body: await readFile(join(chapterDir, 'chapter.md'), 'utf8'),
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

async function readJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
	return schema.parse(JSON.parse(await readFile(path, 'utf8')));
}

async function readTests(
	problemDir: string,
	problemId: string,
	kind: Test['kind']
): Promise<Test[]> {
	const testDir = join(problemDir, 'tests', kind);
	const names = (await listFiles(testDir))
		.filter((f) => f.endsWith('.in'))
		.map((f) => f.slice(0, -'.in'.length))
		.sort();
	return Promise.all(
		names.map(async (name) => ({
			id: `${problemId}/${kind}/${name}`,
			kind,
			input: await readFile(join(testDir, `${name}.in`), 'utf8'),
			expected: await readFile(join(testDir, `${name}.out`), 'utf8')
		}))
	);
}

async function readHints(hintDir: string): Promise<string[]> {
	const numbers = (await listFiles(hintDir)).map((f) => Number(f.slice(0, -'.md'.length)));
	numbers.sort((a, b) => a - b);
	return Promise.all(numbers.map((n) => readFile(join(hintDir, `${n}.md`), 'utf8')));
}

async function readReferenceCode(referenceDir: string): Promise<Record<Language, BuildFiles>> {
	const code = {} as Record<Language, BuildFiles>;
	for (const language of LANGUAGES) {
		const languageDir = join(referenceDir, language);
		const files: Record<string, string> = {};
		for (const path of (await listFiles(languageDir, true)).sort()) {
			files[path.split(sep).join('/')] = await readFile(join(languageDir, path), 'utf8');
		}
		code[language] = files;
	}
	return code;
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
