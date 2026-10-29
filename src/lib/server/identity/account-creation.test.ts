import { describe, expect, it } from 'vitest';
import {
	hasForbiddenNameCharacter,
	isNameTooLong,
	MAX_NAME_LENGTH,
	providerName
} from './account-creation.ts';

const emoji = '\u{1F600}'; // one code point, two UTF-16 units

describe('isNameTooLong', () => {
	it('is 100', () => {
		expect(MAX_NAME_LENGTH).toBe(100);
	});

	it.each([
		['', false],
		['Ada', false],
		['a'.repeat(100), false],
		['a'.repeat(101), true],
		// Two UTF-16 units each, one code point each: 100 fit, 101 do not.
		[emoji.repeat(100), false],
		[emoji.repeat(101), true],
		[`${'a'.repeat(99)}${emoji}`, false],
		[`${'a'.repeat(100)}${emoji}`, true],
		// Lone surrogates are one code point per unit.
		['\ud800'.repeat(100), false],
		['\ud800'.repeat(101), true],
		// Trimmed first, with the same trim the forms use (Unicode whitespace included).
		[`   ${'a'.repeat(100)}   `, false],
		[`\u00a0\u3000${'a'.repeat(100)}\ufeff\n`, false],
		[`${' '.repeat(5000)}x${' '.repeat(5000)}`, false],
		[`${'a'.repeat(50)} ${'b'.repeat(50)} c`, true],
		['x'.repeat(512 * 1024), true]
	])('%j.length=%#', (name, tooLong) => {
		expect(isNameTooLong(name)).toBe(tooLong);
	});
});

describe('hasForbiddenNameCharacter', () => {
	const at = (cp: number) => `Ada${String.fromCodePoint(cp)}Lovelace`;

	it.each([
		[0x0000, true],
		[0x001f, true],
		[0x0020, false],
		[0x007e, false],
		[0x007f, true],
		[0x009f, true],
		[0x00a0, false],
		[0x2029, false],
		[0x202a, true],
		[0x202e, true],
		[0x202f, false],
		[0x2065, false],
		[0x2066, true],
		[0x2069, true],
		[0x206a, false],
		// Allowed by decision: ZWJ for emoji sequences, and the zero-width space and word joiner.
		[0x200b, false],
		[0x200d, false],
		[0x2060, false]
	])('U+%s refused=%s', (cp, refused) => {
		expect(hasForbiddenNameCharacter(at(cp))).toBe(refused);
	});

	it('refuses a tab or newline inside the name but not around it (trimmed away)', () => {
		expect(hasForbiddenNameCharacter('Ada\tLovelace')).toBe(true);
		expect(hasForbiddenNameCharacter('Ada\nLovelace')).toBe(true);
		expect(hasForbiddenNameCharacter('  Ada Lovelace\n')).toBe(false);
	});

	it('allows an emoji ZWJ sequence', () => {
		expect(hasForbiddenNameCharacter('\u{1F469}\u200D\u{1F4BB} Ada')).toBe(false);
	});
});

describe('providerName', () => {
	it('providerName gives nothing only when every source is empty', () => {
		expect(providerName(undefined, undefined, undefined)).toBe('');
		expect(providerName(7, null, '@example.com')).toBe('');
		expect(providerName('  Ada  ', 'x', 'y@z')).toBe('Ada');
	});
});
