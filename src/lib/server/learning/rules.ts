import type { Catalogue } from '../content/catalogue.ts';

/** What a Learner has done: Read marks and Solved Problems, by stable content id. */
export interface Progress {
	readonly readChapters: ReadonlySet<string>;
	readonly solvedProblems: ReadonlySet<string>;
	/** The Topic the Learner was last active in, if any. */
	readonly recentTopicId?: string;
}

export type TopicState = 'locked' | 'unlocked' | 'complete';

/** One Topic as the Map shows it. */
export interface MapTopic {
	readonly id: string;
	readonly title: string;
	readonly state: TopicState;
	/** Prerequisite Topic ids. */
	readonly prerequisites: readonly string[];
	/** Core Problems Solved. Extra Problems never count. */
	readonly coreSolved: number;
	readonly coreTotal: number;
}

export interface MapView {
	/** In content order. */
	readonly topics: readonly MapTopic[];
	/** The Topic with the most recent activity; undefined when there is none. */
	readonly currentTopicId?: string;
}

/**
 * The Topic Map for one Learner. Pure: Unlocked, Locked and Complete are derived from
 * Progress, never stored (docs/module-map.md).
 */
export function mapView(
	catalogue: Pick<Catalogue, 'topicMap' | 'topic'>,
	progress: Progress
): MapView {
	const summaries = catalogue.topicMap();
	const complete = new Set<string>();
	const counts = new Map<string, { coreSolved: number; coreTotal: number }>();

	for (const { id } of summaries) {
		const topic = catalogue.topic(id);
		const mainLine = topic?.mainLine ?? [];
		const coreSolved = mainLine.filter((p) => progress.solvedProblems.has(p)).length;
		counts.set(id, { coreSolved, coreTotal: mainLine.length });
		const allRead = (topic?.chapters ?? []).every((c) => progress.readChapters.has(c.id));
		if (allRead && coreSolved === mainLine.length) complete.add(id);
	}

	const topics = summaries.map(({ id, title, prerequisites }): MapTopic => {
		// Complete wins: a Prerequisite added by a content upgrade never re-locks finished work.
		const state: TopicState = complete.has(id)
			? 'complete'
			: prerequisites.every((p) => complete.has(p))
				? 'unlocked'
				: 'locked';
		return {
			id,
			title,
			state,
			prerequisites,
			...(counts.get(id) ?? { coreSolved: 0, coreTotal: 0 })
		};
	});

	return { topics, currentTopicId: progress.recentTopicId };
}
