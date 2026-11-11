import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

type Mode = 'light' | 'dark';

// Every colour token is written once as light-dark(light, dark); read the pair out of the file so a
// token change is what the test sees.
function token(name: string, mode: Mode): string {
	const match = css.match(
		new RegExp(`--${name}:\\s*light-dark\\(\\s*(#[0-9a-f]{6})\\s*,\\s*(#[0-9a-f]{6})\\s*\\)`, 'i')
	);
	if (!match)
		throw new Error(`--${name} is not a light-dark(#rrggbb, #rrggbb) token in tokens.css`);
	return match[mode === 'light' ? 1 : 2];
}

function channel(hex: string, at: number): number {
	const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
	return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
	return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

// WCAG 2.x contrast ratio.
function ratio(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ['paper', 'panel', 'field'] as const;

// Add a pair by adding a row: the foreground token, the surface tokens it sits on, and the least
// ratio WCAG asks for (4.5 for text, 3 for non-text parts of a control).
const PAIRS: { kind: 'text' | 'non-text'; fg: string; on: readonly string[]; min: number }[] = [
	{ kind: 'text', fg: 'ink', on: SURFACES, min: 4.5 },
	{ kind: 'text', fg: 'body', on: SURFACES, min: 4.5 },
	{ kind: 'text', fg: 'muted', on: SURFACES, min: 4.5 },
	{ kind: 'text', fg: 'accent', on: SURFACES, min: 4.5 },
	{ kind: 'text', fg: 'on-ink', on: ['ink'], min: 4.5 },
	{ kind: 'non-text', fg: 'accent', on: SURFACES, min: 3 },
	{ kind: 'non-text', fg: 'ink', on: SURFACES, min: 3 }
];

describe('colour tokens meet WCAG contrast', () => {
	for (const mode of ['light', 'dark'] as const) {
		for (const { kind, fg, on, min } of PAIRS) {
			for (const surface of on) {
				it(`${mode} ${kind}: ${fg} on ${surface} is at least ${min}:1`, () => {
					expect(ratio(token(fg, mode), token(surface, mode))).toBeGreaterThanOrEqual(min);
				});
			}
		}
	}

	it('the light accent is the canvas vermilion', () => {
		expect(token('accent', 'light').toLowerCase()).toBe('#ae3f1d');
	});
});
