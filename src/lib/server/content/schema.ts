import { z } from 'zod';
import { LANGUAGE_IDS } from '../../languages';

/** The on-disk manifests of a content folder. The format is described in README.md. */

/** Every Language the Runner supports (`LANGUAGES` in src/lib/languages.ts, the one list). */
export const LANGUAGES = LANGUAGE_IDS;

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
