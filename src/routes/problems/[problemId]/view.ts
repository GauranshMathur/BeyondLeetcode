// The Problem screen's two tab sets as one state. `section` is the left pane's tab (read from `?tab`); `pane` is the
// phone's one-pane-at-a-time choice. Pure: nothing renders from it yet.
export const SECTIONS = ['problem', 'hints', 'solution'] as const;
export const PANES = ['problem', 'code', 'tests'] as const;

export type Section = (typeof SECTIONS)[number];
export type Pane = (typeof PANES)[number];
export type ViewState = { section: Section; pane: Pane };

/** The section a `?tab` value names; the Problem is the default and has no `?tab`. */
export const sectionOf = (value: string | null): Section =>
	value === 'hints' || value === 'solution' ? value : 'problem';

export const viewOf = (tab: string | null): ViewState => ({
	section: sectionOf(tab),
	pane: 'problem'
});

/** A Run or Submit answer arrived: show the tests, unless the run is still in flight. */
export const afterOutcome = (view: ViewState, outcome: { kind: string } | undefined): ViewState =>
	outcome && outcome.kind !== 'running' && outcome.kind !== 'submitting'
		? { ...view, pane: 'tests' }
		: view;

/** Another Problem starts on its statement. */
export const onAnotherProblem = (view: ViewState): ViewState => ({ ...view, pane: 'problem' });

/** A language switch remounts the workspace but keeps the pane. */
export const onLanguageSwitch = (view: ViewState): ViewState => view;

/** Moving between Problem, Hints and Solution keeps the pane. */
export const onSectionChange = (view: ViewState, section: Section): ViewState => ({
	...view,
	section
});
