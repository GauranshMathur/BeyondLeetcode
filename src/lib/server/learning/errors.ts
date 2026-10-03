export type LearningErrorCode = 'NotFound' | 'TopicLocked' | 'RevisionConflict' | 'InvalidBuild';

/** A refusal from the Learning core (docs/module-map.md). A Verdict is never an error. */
export class LearningError extends Error {
	constructor(readonly code: LearningErrorCode) {
		super(code);
		this.name = 'LearningError';
	}
}
