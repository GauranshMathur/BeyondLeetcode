import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { z } from 'zod';
import type { Language } from '../runner/port.ts';
import {
	chapterManifest,
	contentManifest,
	LANGUAGES,
	problemManifest,
	topicManifest
} from './schema.ts';

export type { Language };

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

	/** Markdown prose: must exist and say something. */
	async function readMarkdown(path: string): Promise<string> {
		const text = await readText(path);
		if (text !== '' && text.trim() === '') report(path, 'must not be empty');
		return text;
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
		reportFolders(testDir, await listDirs(testDir));
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
		reportFolders(hintDir, await listDirs(hintDir));
		const files = await listFiles(hintDir);
		const numbered = files.filter((f) => /^\d+\.md$/.test(f));
		for (const file of files.filter((f) => !numbered.includes(f))) {
			report(join(hintDir, file), 'expected a numbered Hint like 1.md');
		}
		const expected = numbered.map((_, i) => `${i + 1}.md`);
		if (!expected.every((f) => numbered.includes(f))) {
			const found = [...numbered].sort((x, y) => x.localeCompare(y, 'en', { numeric: true }));
			report(
				hintDir,
				`Hints must be 1.md to ${numbered.length}.md in order, found ${found.join(', ')}`
			);
			return [];
		}
		return Promise.all(expected.map((f) => readMarkdown(join(hintDir, f))));
	}

	function reportFolders(parentDir: string, folders: readonly string[]) {
		for (const folder of folders) report(parentDir, `unexpected folder "${folder}"`);
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
		const coreSoFar = new Set<string>();
		const unreadable = new Set<string>();

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
				if (!manifest) {
					unreadable.add(problemId);
					continue;
				}
				if (manifest.kind === 'core') coreSoFar.add(problemId);
				else if (!coreSoFar.has(manifest.parent) && !unreadable.has(manifest.parent)) {
					report(
						join(problemDir, 'problem.json'),
						`parent "${manifest.parent}" is not a Core Problem before it in Topic "${topicId}"`
					);
				}
				summaries.push({ id: problemId, ...manifest });
				problems.set(problemId, {
					id: problemId,
					...manifest,
					topicId,
					chapterId,
					statement: await readMarkdown(join(problemDir, 'statement.md')),
					exampleTests: await readTests(problemDir, problemId, 'example'),
					hints: await readHints(join(problemDir, 'hints')),
					solution: await readMarkdown(join(problemDir, 'solution.md')),
					referenceCode: await readReferenceCode(join(problemDir, 'reference'))
				});
				hidden.set(problemId, await readTests(problemDir, problemId, 'hidden'));
			}

			const loaded: Chapter = {
				id: chapterId,
				topicId,
				title: chapter.title,
				body: await readMarkdown(join(chapterDir, 'chapter.md')),
				problems: summaries
			};
			chapters.set(chapterId, loaded);
			topicChapters.push(loaded);
		}

		if (topic.chapters.length === 0) {
			report(join(topicDir, 'topic.json'), 'a Topic needs at least one Chapter');
		} else if (unreadable.size === 0 && topicChapters.length === topic.chapters.length) {
			const hasCore = topicChapters.some((c) => c.problems.some((p) => p.kind === 'core'));
			if (!hasCore) report(join(topicDir, 'topic.json'), 'a Topic needs at least one Core Problem');
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

	checkPrerequisites(topics, new Set(content?.topics), (topicId, message) =>
		report(join(dir, 'topics', topicId, 'topic.json'), message)
	);

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

/** Every Prerequisite is a Topic, and Prerequisites never form a cycle. */
function checkPrerequisites(
	topics: ReadonlyMap<string, Topic>,
	topicIds: ReadonlySet<string>,
	report: (topicId: string, message: string) => void
) {
	for (const topic of topics.values()) {
		for (const prerequisite of topic.prerequisites) {
			if (!topicIds.has(prerequisite)) {
				report(topic.id, `Prerequisite "${prerequisite}" is not a Topic`);
			}
		}
	}

	const state = new Map<string, 'visiting' | 'done'>();
	const visit = (id: string, path: string[]) => {
		if (state.get(id) === 'done') return;
		if (state.get(id) === 'visiting') {
			const cycle = [...path.slice(path.indexOf(id)), id];
			report(id, `Prerequisites form a cycle: ${cycle.join(' -> ')}`);
			return;
		}
		state.set(id, 'visiting');
		for (const prerequisite of topics.get(id)?.prerequisites ?? []) {
			visit(prerequisite, [...path, id]);
		}
		state.set(id, 'done');
	};
	for (const id of topics.keys()) visit(id, []);
}

/** Dotfiles (such as .DS_Store) are never content. */
const isDotfile = (path: string) => path.split(sep).some((part) => part.startsWith('.'));

/** A folder that is not there reads as empty; any other failure (permissions, I/O) is real. */
function ifMissing<T>(fallback: T) {
	return (error: unknown): T => {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === 'ENOENT' || code === 'ENOTDIR') return fallback;
		throw error;
	};
}

/** Names of the subfolders of `dir`, dotfiles skipped; empty when `dir` does not exist. */
async function listDirs(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true }).catch(ifMissing([]));
	return entries.filter((e) => e.isDirectory() && !isDotfile(e.name)).map((e) => e.name);
}

/** Relative paths of the regular files in `dir`, dotfiles skipped; empty when `dir` does not exist. */
async function listFiles(dir: string, recursive = false): Promise<string[]> {
	const all = await readdir(dir, { recursive }).catch(ifMissing([] as string[]));
	const entries = all.filter((e) => !isDotfile(e));
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
