import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isPlaceholderSecret, MIN_SECRET_LENGTH, secretProblem } from './secret.ts';

describe('the Better Auth secret check', () => {
	it('refuses the BETTER_AUTH_SECRET that .env.example ships, whatever its wording', () => {
		const example = readFileSync(new URL('../../../../.env.example', import.meta.url), 'utf8');
		const shipped = /^BETTER_AUTH_SECRET="(.*)"$/m.exec(example)?.[1];

		expect(shipped).toBeTruthy();
		expect(shipped?.length).toBeGreaterThanOrEqual(MIN_SECRET_LENGTH);
		expect(isPlaceholderSecret(shipped ?? '')).toBe(true);
		expect(isPlaceholderSecret('d41d8cd98f00b204e9800998ecf8427e1a2b3c4d5e6f708192')).toBe(false);
	});

	it('names the first problem, checked missing, then placeholder, then short', () => {
		expect(secretProblem('')).toBe('missing');
		expect(secretProblem('short')).toBe('short');
		expect(secretProblem('change-me')).toBe('placeholder');
		expect(secretProblem('Change-Me-to-a-random-string-of-48-characters')).toBe('placeholder');
		expect(secretProblem('better-auth-secret-12345678901234567890')).toBe('placeholder');
		expect(secretProblem('d41d8cd98f00b204e9800998ecf8427e1a2b3c4d5e6f708192')).toBeNull();
		expect(secretProblem('a'.repeat(MIN_SECRET_LENGTH - 1))).toBe('short');
		expect(secretProblem('a'.repeat(MIN_SECRET_LENGTH))).toBeNull();
	});
});
