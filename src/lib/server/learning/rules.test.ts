import { describe, expect, it } from 'vitest';
import type { Catalogue, Topic, TopicSummary } from '../content/catalogue.ts';
import { mapView, type Progress } from './rules.ts';

/** A Topic with the given Prerequisites, its Chapters and its Core Problems (the Main Line). */
function topic(
	id: string,
	prerequisites: string[],
	{ chapters = ['c'], core = ['p'] } = {}
): Topic {
	return {
		id,
		title: id.toUpperCase(),
		summary: '',
		prerequisites,
		chapters: chapters.map((c) => ({ id: `${id}-${c}`, title: c, problems: [] })),
		mainLine: core.map((p) => `${id}-${p}`)
	};
}

function catalogueOf(topics: Topic[]): Pick<Catalogue, 'topicMap' | 'topic'> {
	const summaries: TopicSummary[] = topics.map(({ id, title, summary, prerequisites }) => ({
		id,
		title,
		summary,
		prerequisites
	}));
	return { topicMap: () => summaries, topic: (id) => topics.find((t) => t.id === id) };
}

const none: Progress = { readChapters: new Set(), solvedProblems: new Set() };
const progress = (read: string[], solved: string[], recentTopicId?: string): Progress => ({
	readChapters: new Set(read),
	solvedProblems: new Set(solved),
	recentTopicId
});
const states = (view: ReturnType<typeof mapView>) =>
	Object.fromEntries(view.topics.map((t) => [t.id, t.state]));

describe('Unlock rules', () => {
	const chain = catalogueOf([topic('a', []), topic('b', ['a']), topic('c', ['a', 'b'])]);

	it('unlocks Topics without Prerequisites and locks the rest', () => {
		expect(states(mapView(chain, none))).toEqual({ a: 'unlocked', b: 'locked', c: 'locked' });
	});

	it('keeps a Topic Locked while a Prerequisite is only partly done', () => {
		expect(states(mapView(chain, progress(['a-c'], [])))).toMatchObject({ b: 'locked' });
		expect(states(mapView(chain, progress([], ['a-p'])))).toMatchObject({ b: 'locked' });
	});

	it('unlocks a Topic when its Prerequisite is Complete, and marks that one Complete', () => {
		expect(states(mapView(chain, progress(['a-c'], ['a-p'])))).toEqual({
			a: 'complete',
			b: 'unlocked',
			c: 'locked'
		});
	});

	it('needs every Prerequisite Complete, not just one', () => {
		const view = mapView(chain, progress(['a-c', 'b-c'], ['a-p', 'b-p']));
		expect(states(view)).toEqual({ a: 'complete', b: 'complete', c: 'unlocked' });
		const onlyB = catalogueOf([topic('a', []), topic('x', []), topic('c', ['a', 'x'])]);
		expect(states(mapView(onlyB, progress(['a-c'], ['a-p'])))).toMatchObject({ c: 'locked' });
	});

	it('keeps a Complete Topic Complete even if a Prerequisite is not', () => {
		expect(states(mapView(chain, progress(['c-c'], ['c-p'])))).toMatchObject({
			b: 'locked',
			c: 'complete'
		});
	});
});

describe('Complete rule', () => {
	const two = catalogueOf([topic('t', [], { chapters: ['c1', 'c2'], core: ['p1', 'p2'] })]);

	it('needs every Chapter Read and every Core Problem Solved', () => {
		const all = progress(['t-c1', 't-c2'], ['t-p1', 't-p2']);
		expect(states(mapView(two, all)).t).toBe('complete');
		expect(states(mapView(two, progress(['t-c1'], ['t-p1', 't-p2']))).t).toBe('unlocked');
		expect(states(mapView(two, progress(['t-c1', 't-c2'], ['t-p1']))).t).toBe('unlocked');
	});

	it('never counts Extra Problems, solved or not', () => {
		const withExtra = progress(['t-c1', 't-c2'], ['t-p1', 't-p2', 't-extra']);
		expect(states(mapView(two, withExtra)).t).toBe('complete');
		expect(mapView(two, progress([], ['t-extra'])).topics[0]).toMatchObject({
			coreSolved: 0,
			coreTotal: 2
		});
	});
});

describe('map counts and current Topic', () => {
	const cat = catalogueOf([topic('a', [], { core: ['p1', 'p2'] }), topic('b', ['a'])]);

	it('reports id, title, Prerequisites and Core solved counts per Topic', () => {
		expect(mapView(cat, progress([], ['a-p1'])).topics).toEqual([
			{
				id: 'a',
				title: 'A',
				state: 'unlocked',
				prerequisites: [],
				coreSolved: 1,
				coreTotal: 2
			},
			{ id: 'b', title: 'B', state: 'locked', prerequisites: ['a'], coreSolved: 0, coreTotal: 1 }
		]);
	});

	it('has no current Topic without activity, else the most recently active one', () => {
		expect(mapView(cat, none).currentTopicId).toBeUndefined();
		expect(mapView(cat, progress([], [], 'a')).currentTopicId).toBe('a');
	});
});
