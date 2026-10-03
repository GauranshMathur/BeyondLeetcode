import type { Catalogue } from '../content/catalogue.ts';
import { LearningError } from './errors.ts';

/** What a Learner has done: Read marks and Solved Problems, by stable content id. */
export interface Progress {
	readonly readChapters: ReadonlySet<string>;
	readonly solvedProblems: ReadonlySet<string>;
	/** Problems with a Submission but not yet Solved. Treated as none when absent. */
	readonly attemptedProblems?: ReadonlySet<string>;
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
		const state: TopicState = !prerequisites.every((p) => complete.has(p))
			? 'locked'
			: complete.has(id)
				? 'complete'
				: 'unlocked';
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

export type ProblemStatus = 'Solved' | 'Attempted' | 'Untouched';

export interface TopicProblem {
	readonly id: string;
	readonly title: string;
	readonly kind: 'Core' | 'Extra';
	/** For an Extra Problem: the Core Problem it branches off. */
	readonly parentProblemId?: string;
	readonly status: ProblemStatus;
}

export interface TopicChapter {
	readonly id: string;
	readonly title: string;
	readonly read: boolean;
	readonly problems: readonly TopicProblem[];
}

/** One Unlocked or Complete Topic: Chapters and Problems in content order. No Tests, Hints, Solutions or Reference Code. */
export interface TopicView {
	readonly id: string;
	readonly title: string;
	readonly state: Exclude<TopicState, 'locked'>;
	readonly chapters: readonly TopicChapter[];
	readonly counts: {
		readonly chaptersRead: number;
		readonly chaptersTotal: number;
		readonly coreSolved: number;
		readonly coreTotal: number;
		readonly extraSolved: number;
		readonly extraTotal: number;
	};
}

/**
 * One Topic for one Learner. Pure. Throws NotFound for an unknown id and TopicLocked while
 * a Prerequisite is not Complete.
 */
export function topicView(
	catalogue: Pick<Catalogue, 'topicMap' | 'topic'>,
	progress: Progress,
	topicId: string
): TopicView {
	const topic = catalogue.topic(topicId);
	const mapTopic = mapView(catalogue, progress).topics.find((t) => t.id === topicId);
	if (!topic || !mapTopic) throw new LearningError('NotFound');
	if (mapTopic.state === 'locked') throw new LearningError('TopicLocked');

	const attempted = progress.attemptedProblems ?? new Set<string>();
	const chapters = topic.chapters.map(
		(c): TopicChapter => ({
			id: c.id,
			title: c.title,
			read: progress.readChapters.has(c.id),
			problems: c.problems.map(
				(p): TopicProblem => ({
					id: p.id,
					title: p.title,
					kind: p.kind === 'core' ? 'Core' : 'Extra',
					...(p.parent !== undefined && { parentProblemId: p.parent }),
					status: progress.solvedProblems.has(p.id)
						? 'Solved'
						: attempted.has(p.id)
							? 'Attempted'
							: 'Untouched'
				})
			)
		})
	);
	const problems = chapters.flatMap((c) => c.problems);
	const count = (kind: TopicProblem['kind'], solvedOnly: boolean) =>
		problems.filter((p) => p.kind === kind && (!solvedOnly || p.status === 'Solved')).length;

	return {
		id: topic.id,
		title: topic.title,
		state: mapTopic.state,
		chapters,
		counts: {
			chaptersRead: chapters.filter((c) => c.read).length,
			chaptersTotal: chapters.length,
			coreSolved: count('Core', true),
			coreTotal: count('Core', false),
			extraSolved: count('Extra', true),
			extraTotal: count('Extra', false)
		}
	};
}
