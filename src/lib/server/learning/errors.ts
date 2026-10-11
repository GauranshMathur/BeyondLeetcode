export type LearningErrorCode =
	| 'NotFound'
	| 'TopicLocked'
	| 'RevisionConflict'
	| 'InvalidBuild'
	| 'RunnerUnavailable';

/** A refusal from the Learning core (docs/module-map.md). A Verdict is never an error. */
export class LearningError extends Error {
	/**
	 * `revision`: set when the Learner's code was saved before the refusal (a Runner outage during
	 * Run or Submit), so the tab can carry on from the revision the save produced.
	 */
	constructor(
		readonly code: LearningErrorCode,
		readonly revision?: number
	) {
		super(code);
		this.name = 'LearningError';
	}
}
