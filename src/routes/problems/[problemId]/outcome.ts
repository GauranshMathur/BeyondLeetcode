import type { RunView } from '$lib/server/learning/core';

/** What the console shows: nothing yet, a Run in flight, a Runner failure, or the result. */
export type Outcome =
	| { kind: 'running' }
	| { kind: 'unavailable' }
	| { kind: 'result'; view: RunView };
