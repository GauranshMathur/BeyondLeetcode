import { describe, expect, it } from 'vitest';
import { entryFileOf, LANGUAGE_IDS, LANGUAGES, languageById } from './languages';
import { sandboxConfig } from './server/runner/config';

describe('LANGUAGES', () => {
	it('holds the three Languages in picker order', () => {
		expect(LANGUAGE_IDS).toEqual(['python', 'typescript', 'go']);
	});

	it.each(LANGUAGES)('$id has a name, an entry file in that Language and a Sandbox image', (l) => {
		expect(l.name.length).toBeGreaterThan(0);
		expect(l.entryFile).toMatch(/^main\.[a-z]+$/);
		expect(sandboxConfig.images[l.id]).toBeTruthy();
	});

	it('has no duplicate ids or entry files, and no image for a Language not on the list', () => {
		expect(new Set(LANGUAGES.map((l) => l.id)).size).toBe(LANGUAGES.length);
		expect(new Set(LANGUAGES.map((l) => l.entryFile)).size).toBe(LANGUAGES.length);
		expect(Object.keys(sandboxConfig.images).sort()).toEqual([...LANGUAGE_IDS].sort());
	});

	it('looks a Language up by id', () => {
		expect(languageById('go')?.name).toBe('Go');
		expect(languageById('rust')).toBeUndefined();
		expect(languageById(null)).toBeUndefined();
		expect(entryFileOf('typescript')).toBe('main.ts');
	});
});
