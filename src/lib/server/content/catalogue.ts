import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { z } from 'zod';
import { contentManifest, topicManifest } from './schema.ts';

export interface TopicSummary {
	readonly id: string;
	readonly title: string;
	readonly summary: string;
	readonly prerequisites: readonly string[];
}

export interface Catalogue {
	/** Every Topic, in content order, with its Prerequisites. */
	topicMap(): readonly TopicSummary[];
}

export async function loadCatalogue(dir: string): Promise<Catalogue> {
	const content = await readJson(join(dir, 'content.json'), contentManifest);
	const topics: TopicSummary[] = [];
	for (const topicId of content.topics) {
		const topic = await readJson(join(dir, 'topics', topicId, 'topic.json'), topicManifest);
		topics.push({
			id: topicId,
			title: topic.title,
			summary: topic.summary,
			prerequisites: topic.prerequisites
		});
	}
	return { topicMap: () => topics };
}

async function readJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
	return schema.parse(JSON.parse(await readFile(path, 'utf8')));
}
