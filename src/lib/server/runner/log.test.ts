import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorKind, logLine } from './log';

afterEach(() => vi.restoreAllMocks());

describe("the Runner's error kind", () => {
	it('is the class name of an Error subclass', () => {
		class DaemonError extends Error {}
		expect(errorKind(new DaemonError('x'))).toBe('DaemonError');
	});

	it('is Error when the constructor name is not a plain identifier', () => {
		const error = new Error('x');
		Object.defineProperty(error, 'constructor', { value: { name: 'bad\nforged line' } });
		expect(errorKind(error)).toBe('Error');
	});

	it('is NonError for a string', () => {
		expect(errorKind('boom')).toBe('NonError');
	});

	it('is NonError for a Proxy whose traps throw', () => {
		const trap = () => {
			throw new Error('trap');
		};
		const proxy = new Proxy(new Error('x'), { getPrototypeOf: trap, get: trap });
		expect(errorKind(proxy)).toBe('NonError');
	});

	it('is Error when the constructor name is not a string', () => {
		const error = new Error('x');
		Object.defineProperty(error, 'constructor', { value: { name: 42 } });
		expect(errorKind(error)).toBe('Error');
	});

	it('is Error when the constructor getter throws', () => {
		const error = new Error('x');
		Object.defineProperty(error, 'constructor', {
			get() {
				throw new Error('getter');
			}
		});
		expect(errorKind(error)).toBe('Error');
	});
});

describe("the Runner's log line", () => {
	it('prints the text in one console.error call with one argument', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		logLine('plain text');
		expect(spy.mock.calls).toEqual([['plain text']]);
	});

	it.each([
		['a\nb', 'a b'],
		['a\r\nb', 'a  b'],
		['a\u0000b', 'a b'],
		['a‮b', 'a b'],
		['a b c', 'a b c']
	])('replaces control characters in %j with spaces', (text, printed) => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		logLine(text);
		expect(spy.mock.calls).toEqual([[printed]]);
	});

	it('returns normally when console.error throws', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {
			throw new Error('console is gone');
		});
		expect(() => logLine('x')).not.toThrow();
	});
});
