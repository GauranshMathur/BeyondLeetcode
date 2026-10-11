/**
 * The Languages a Learner can build in: the one list. Browser-safe on purpose (id, display name and
 * entry file only); the Sandbox image of each lives server-side in `server/runner/config.ts`, keyed
 * by `Language`.
 */
export const LANGUAGES = [
	{ id: 'python', name: 'Python', entryFile: 'main.py' },
	{ id: 'typescript', name: 'TypeScript', entryFile: 'main.ts' },
	{ id: 'go', name: 'Go', entryFile: 'main.go' }
] as const;

export type Language = (typeof LANGUAGES)[number]['id'];

/** The ids in list order, for validation (`z.enum`, form checks) and prose. */
export const LANGUAGE_IDS = LANGUAGES.map((l) => l.id) as [Language, ...Language[]];

/** The Language with this id, or undefined for anything that is not one. */
export function languageById(id: unknown): (typeof LANGUAGES)[number] | undefined {
	return LANGUAGES.find((l) => l.id === id);
}

/** The entry file of a Build that has not been started. */
export function entryFileOf(language: Language): string {
	const found = languageById(language);
	if (!found) throw new Error(`Unknown Language: ${language}`);
	return found.entryFile;
}
