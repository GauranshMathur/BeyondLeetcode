import { describe, expect, it } from 'vitest';
import {
	afterOutcome,
	onAnotherProblem,
	onLanguageSwitch,
	onSectionChange,
	sectionOf,
	type ViewState,
	viewOf
} from './view';

const at = (section: ViewState['section'], pane: ViewState['pane']): ViewState => ({
	section,
	pane
});

describe('the Problem screen view state', () => {
	it('reads the section from ?tab, defaulting to problem', () => {
		expect(sectionOf('hints')).toBe('hints');
		expect(sectionOf('solution')).toBe('solution');
		expect(sectionOf(null)).toBe('problem');
		expect(sectionOf('nonsense')).toBe('problem');
		expect(viewOf('hints')).toEqual(at('hints', 'problem'));
	});

	it('a Run or Submit outcome that is not running or submitting opens tests', () => {
		expect(afterOutcome(at('problem', 'code'), { kind: 'passed' }).pane).toBe('tests');
		expect(afterOutcome(at('hints', 'code'), { kind: 'failed' })).toEqual(at('hints', 'tests'));
		expect(afterOutcome(at('problem', 'code'), { kind: 'running' }).pane).toBe('code');
		expect(afterOutcome(at('problem', 'code'), { kind: 'submitting' }).pane).toBe('code');
		expect(afterOutcome(at('problem', 'code'), undefined).pane).toBe('code');
	});

	it('another Problem resets the pane to problem', () => {
		expect(onAnotherProblem(at('hints', 'tests'))).toEqual(at('hints', 'problem'));
	});

	it('a language switch keeps the pane', () => {
		expect(onLanguageSwitch(at('solution', 'code'))).toEqual(at('solution', 'code'));
	});

	it('a section change keeps the pane', () => {
		expect(onSectionChange(at('problem', 'tests'), 'hints')).toEqual(at('hints', 'tests'));
	});
});
