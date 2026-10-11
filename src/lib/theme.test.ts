import { describe, expect, it } from 'vitest';
import { parseTheme, withTheme } from './theme';

describe('parseTheme', () => {
	it('keeps light and dark', () => {
		expect(parseTheme('light')).toBe('light');
		expect(parseTheme('dark')).toBe('dark');
	});
	it('treats a missing or unknown value as following the device', () => {
		expect(parseTheme(undefined)).toBeNull();
		expect(parseTheme('')).toBeNull();
		expect(parseTheme('system')).toBeNull();
		expect(parseTheme('"><script>')).toBeNull();
	});
});

describe('withTheme', () => {
	const html = '<!doctype html>\n<html lang="en">\n<head></head></html>';
	it('puts data-theme on the html element', () => {
		expect(withTheme(html, 'dark')).toContain('<html lang="en" data-theme="dark">');
	});
	it('leaves the page alone when following the device', () => {
		expect(withTheme(html, null)).toBe(html);
	});
});
