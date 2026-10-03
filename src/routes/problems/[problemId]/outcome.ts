import type { RunView, SubmitView } from '$lib/server/learning/core';

/** What the console shows: nothing yet, a Run or Submit in flight, a Runner failure, or the result. */
export type Outcome =
	| { kind: 'running' }
	| { kind: 'submitting' }
	| { kind: 'unavailable' }
	| { kind: 'result'; view: RunView }
	| { kind: 'verdict'; view: SubmitView };
