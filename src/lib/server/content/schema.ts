import { z } from 'zod';
import type { Language } from '../runner/port.ts';

/** The on-disk manifests of a content folder. The format is described in README.md. */

/** Every Language the Runner supports (`Language` in runner/port.ts, the one source of truth). */
export const LANGUAGES = ['python', 'typescript', 'go'] as const satisfies readonly Language[];

const id = z
	.string()
	.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be a lowercase slug (a-z, 0-9, single hyphens)');
const ids = z.array(id);
const text = z.string().trim().min(1);

export const contentManifest = z.strictObject({ topics: ids });

export const topicManifest = z.strictObject({
	title: text,
	summary: text,
	prerequisites: ids,
	chapters: ids
});

export const chapterManifest = z.strictObject({ title: text, problems: ids });

export const problemManifest = z.discriminatedUnion('kind', [
	z.strictObject({ title: text, kind: z.literal('core') }),
	z.strictObject({ title: text, kind: z.literal('extra'), parent: id })
]);
