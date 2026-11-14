import { describe, expect, it } from 'vitest';
import type { MapView } from '../server/learning/rules.ts';
import { mapEntries } from './entries.ts';
import { BAR_WIDTH } from './layout.ts';

const view = (currentTopicId: string | undefined, topics: MapView['topics']): MapView => ({
	topics,
	...(currentTopicId ? { currentTopicId } : {})
});

const topics: MapView['topics'] = [
	{
		id: 'arrays',
		title: 'Arrays',
		state: 'complete',
		prerequisites: [],
		coreSolved: 4,
		coreTotal: 4
	},
	{
		id: 'maps',
		title: 'Maps',
		state: 'unlocked',
		prerequisites: ['arrays'],
		coreSolved: 1,
		coreTotal: 4
	},
	{
		id: 'fresh',
		title: 'Fresh',
		state: 'unlocked',
		prerequisites: [],
		coreSolved: 0,
		coreTotal: 3
	},
	{
		id: 'graphs',
		title: 'Graphs',
		state: 'locked',
		prerequisites: ['arrays', 'maps', 'gone'],
		coreSolved: 0,
		coreTotal: 5
	}
];

describe('mapEntries', () => {
	it('gives a complete Topic a link, "done" text and a full bar', () => {
		const [arrays] = mapEntries(view(undefined, topics));
		expect(arrays).toEqual({
			id: 'arrays',
			title: 'Arrays',
			state: 'complete',
			href: '/topics/arrays',
			current: false,
			label: 'Arrays, complete, 4 of 4 core problems solved',
			count: '4/4',
			stateText: 'done · 4/4',
			after: undefined,
			fill: BAR_WIDTH
		});
	});

	it('gives an open Topic with some progress its count, an after line and a partial bar', () => {
		const maps = mapEntries(view(undefined, topics))[1];
		expect(maps).toMatchObject({
			href: '/topics/maps',
			current: false,
			label: 'Maps, unlocked, 1 of 4 core problems solved',
			count: '1/4',
			stateText: '1/4 solved',
			after: 'after Arrays',
			fill: BAR_WIDTH / 4
		});
	});

	it('gives an open Topic with no progress an empty bar', () => {
		const fresh = mapEntries(view(undefined, topics))[2];
		expect(fresh).toMatchObject({ stateText: '0/3 solved', fill: 0, after: undefined });
	});

	it('gives a locked Topic no link and no current mark, and names its Prerequisites', () => {
		const graphs = mapEntries(view(undefined, topics))[3];
		expect(graphs).toMatchObject({
			href: undefined,
			current: false,
			label: 'Graphs, locked, 0 of 5 core problems solved',
			stateText: 'locked',
			// A Prerequisite missing from the Map falls back to its id.
			after: 'after Arrays, Maps, gone'
		});
	});

	it('marks the current Topic and words its state as current', () => {
		const entries = mapEntries(view('maps', topics));
		expect(entries.map((e) => e.current)).toEqual([false, true, false, false]);
		expect(entries[1].stateText).toBe('current · 1/4');
	});

	it('words a current Topic that is complete as current, as before', () => {
		const entries = mapEntries(view('arrays', topics));
		expect(entries[0]).toMatchObject({ current: true, stateText: 'current · 4/4' });
	});

	it('has a Topic with no Core Problems draw an empty bar', () => {
		const [only] = mapEntries(
			view(undefined, [
				{ id: 'x', title: 'X', state: 'unlocked', prerequisites: [], coreSolved: 0, coreTotal: 0 }
			])
		);
		expect(only.fill).toBe(0);
	});
});
