import { expect, it } from 'vitest';
import { layoutMap, NODE_HEIGHT, NODE_WIDTH } from './layout.ts';

const topic = (id: string, prerequisites: string[] = []) => ({
	id,
	title: id,
	state: 'locked' as const,
	prerequisites,
	coreSolved: 0,
	coreTotal: 1
});

it('puts each Topic on the level of its longest Prerequisite chain', () => {
	// c needs a and b; b needs a: c sits below b, not beside it.
	const { nodes } = layoutMap([topic('a'), topic('b', ['a']), topic('c', ['a', 'b'])]);
	expect(nodes.map((n) => [n.topic.id, n.level])).toEqual([
		['a', 0],
		['b', 1],
		['c', 2]
	]);
});

it('orders Topics within a level by content order, left to right', () => {
	const { nodes } = layoutMap([topic('root'), topic('x', ['root']), topic('y', ['root'])]);
	const [x, y] = [nodes[1], nodes[2]];
	expect(x.level).toBe(y.level);
	expect(x.x).toBeLessThan(y.x);
});

it('draws one line from each Prerequisite to its Topic', () => {
	const { edges } = layoutMap([topic('a'), topic('b'), topic('c', ['a', 'b'])]);
	expect(edges.map((e) => [e.from, e.to])).toEqual([
		['a', 'c'],
		['b', 'c']
	]);
});

it('anchors lines at the bottom of the Prerequisite and the top of the Topic', () => {
	const { nodes, edges } = layoutMap([topic('a'), topic('b', ['a'])]);
	const [a, b] = nodes;
	expect(edges[0].y1).toBe(a.y + NODE_HEIGHT);
	expect(edges[0].y2).toBe(b.y);
	expect(edges[0].x1).toBe(a.x + NODE_WIDTH / 2);
});

it('ignores a Prerequisite that is not in the map rather than crashing', () => {
	const { nodes, edges } = layoutMap([topic('a', ['ghost'])]);
	expect(nodes[0].level).toBe(0);
	expect(edges).toEqual([]);
});
