import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { z } from 'zod';
import { chapterManifest, contentManifest, problemManifest, topicManifest } from './schema.ts';

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

export interface Catalogue {
	/** Every Topic, in content order, with its Prerequisites. */
	topicMap(): readonly TopicSummary[];
	topic(id: string): Topic | undefined;
	chapter(id: string): Chapter | undefined;
}

export async function loadCatalogue(dir: string): Promise<Catalogue> {
	const content = await readJson(join(dir, 'content.json'), contentManifest);
	const topics = new Map<string, Topic>();
	const chapters = new Map<string, Chapter>();

	for (const topicId of content.topics) {
		const topicDir = join(dir, 'topics', topicId);
		const topic = await readJson(join(topicDir, 'topic.json'), topicManifest);
		const topicChapters: Chapter[] = [];

		for (const chapterId of topic.chapters) {
			const chapterDir = join(topicDir, 'chapters', chapterId);
			const chapter = await readJson(join(chapterDir, 'chapter.json'), chapterManifest);
			const problems: ProblemSummary[] = [];
			for (const problemId of chapter.problems) {
				const problemDir = join(chapterDir, 'problems', problemId);
				const problem = await readJson(join(problemDir, 'problem.json'), problemManifest);
				problems.push({ id: problemId, ...problem });
			}
			const loaded: Chapter = {
				id: chapterId,
				topicId,
				title: chapter.title,
				body: await readFile(join(chapterDir, 'chapter.md'), 'utf8'),
				problems
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

	return {
		topicMap: () => topicMap,
		topic: (id) => topics.get(id),
		chapter: (id) => chapters.get(id)
	};
}

async function readJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
	return schema.parse(JSON.parse(await readFile(path, 'utf8')));
}
