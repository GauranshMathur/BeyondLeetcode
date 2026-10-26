import { describe, expect, it } from 'vitest';
import { parseOrigin } from './origin';

describe('parseOrigin', () => {
	it('reads ORIGIN as a URL: a bare scheme, a non-http scheme or text is ignored', () => {
		expect(parseOrigin('https://learn.example.com/')).toBe('https://learn.example.com');
		expect(parseOrigin('http://localhost:3000')).toBe('http://localhost:3000');
		for (const bad of [
			undefined,
			'',
			'http://',
			'https://',
			'ftp://x.example',
			'learn.example.com'
		]) {
			expect(parseOrigin(bad)).toBeNull();
		}
	});
});
