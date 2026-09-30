import type { MapTopic } from '../server/learning/rules.ts';

export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 64;
const COLUMN_GAP = 40;
const LEVEL_GAP = 106;
const MARGIN_X = 20;
const MARGIN_Y = 40;

export interface PlacedTopic {
	readonly topic: MapTopic;
	/** Length of the longest Prerequisite chain to this Topic; 0 for a root. */
	readonly level: number;
	readonly x: number;
	readonly y: number;
}

export interface Edge {
	readonly from: string;
	readonly to: string;
	readonly x1: number;
	readonly y1: number;
	readonly x2: number;
	readonly y2: number;
}

export interface MapLayout {
	readonly nodes: readonly PlacedTopic[];
	readonly edges: readonly Edge[];
	readonly width: number;
	readonly height: number;
}

/** Places Topics by Prerequisite depth (rows) and content order (within a row), per the canvas Map. */
export function layoutMap(topics: readonly MapTopic[]): MapLayout {
	const byId = new Map(topics.map((t) => [t.id, t]));
	const levels = new Map<string, number>();
	const levelOf = (id: string, seen: ReadonlySet<string>): number => {
		const known = levels.get(id);
		if (known !== undefined) return known;
		const prerequisites = (byId.get(id)?.prerequisites ?? []).filter(
			(p) => byId.has(p) && !seen.has(p)
		);
		const level = prerequisites.length
			? 1 + Math.max(...prerequisites.map((p) => levelOf(p, new Set([...seen, id]))))
			: 0;
		levels.set(id, level);
		return level;
	};

	const nextColumn = new Map<number, number>();
	const nodes = topics.map((topic): PlacedTopic => {
		const level = levelOf(topic.id, new Set());
		const column = nextColumn.get(level) ?? 0;
		nextColumn.set(level, column + 1);
		return {
			topic,
			level,
			x: MARGIN_X + column * (NODE_WIDTH + COLUMN_GAP),
			y: MARGIN_Y + level * (NODE_HEIGHT + LEVEL_GAP)
		};
	});

	const placed = new Map(nodes.map((n) => [n.topic.id, n]));
	const edges = nodes.flatMap((to) =>
		to.topic.prerequisites.flatMap((id) => {
			const from = placed.get(id);
			if (!from) return [];
			return [
				{
					from: id,
					to: to.topic.id,
					x1: from.x + NODE_WIDTH / 2,
					y1: from.y + NODE_HEIGHT,
					x2: to.x + NODE_WIDTH / 2,
					y2: to.y
				}
			];
		})
	);

	const maxColumns = Math.max(0, ...nextColumn.values());
	const maxLevel = Math.max(0, ...nodes.map((n) => n.level));
	return {
		nodes,
		edges,
		width: MARGIN_X * 2 + maxColumns * NODE_WIDTH + Math.max(0, maxColumns - 1) * COLUMN_GAP,
		height: MARGIN_Y * 2 + (maxLevel + 1) * NODE_HEIGHT + maxLevel * LEVEL_GAP
	};
}
