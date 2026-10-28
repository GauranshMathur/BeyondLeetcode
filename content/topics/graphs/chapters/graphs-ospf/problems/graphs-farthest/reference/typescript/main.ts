import { readFileSync } from 'node:fs';

const names: string[] = []; // every node, in the order it first appeared
const out = new Map<string, string[]>(); // node -> the nodes it has an edge to, in the order added
const weight = new Map<string, number>(); // "from to" -> the weight of that edge
const parents = new Map<string, string>(); // union-find: node -> its parent; a root is its own parent
const ranks = new Map<string, number>(); // union-find: root -> an upper bound on its tree's height
const redundantEdges: string[] = []; // edges whose two ends were already in one group when added
const printed: string[] = [];
const commands: Record<string, (args: string[]) => void> = {};

/** A binary min-heap: `less` says which of two items comes out first. */
class Heap<T> {
	private items: T[] = [];
	private less: (a: T, b: T) => boolean;

	constructor(less: (a: T, b: T) => boolean) {
		this.less = less;
	}

	get size(): number {
		return this.items.length;
	}

	push(item: T): void {
		const items = this.items;
		let pos = items.length;
		items.push(item);
		while (pos > 0) {
			const parent = (pos - 1) >> 1;
			if (!this.less(item, items[parent])) break;
			items[pos] = items[parent];
			pos = parent;
		}
		items[pos] = item;
	}

	pop(): T {
		const items = this.items;
		const top = items[0];
		const last = items.pop() as T;
		if (items.length > 0) {
			let pos = 0;
			for (;;) {
				let child = 2 * pos + 1;
				if (child >= items.length) break;
				if (child + 1 < items.length && this.less(items[child + 1], items[child])) child++;
				if (!this.less(items[child], last)) break;
				items[pos] = items[child];
				pos = child;
			}
			items[pos] = last;
		}
		return top;
	}
}

function addNode(name: string): void {
	if (!out.has(name)) {
		out.set(name, []);
		names.push(name);
		parents.set(name, name);
		ranks.set(name, 0);
	}
}

/** The root of x's group. Each step makes x point at its grandparent (path halving). */
function find<K>(parent: Map<K, K>, x: K): K {
	let node = x;
	for (;;) {
		const up = parent.get(node) as K;
		if (up === node) return node;
		const grandparent = parent.get(up) as K;
		parent.set(node, grandparent);
		node = grandparent;
	}
}

/** Merges the groups of a and b, the lower tree under the higher. False if already one group. */
function union<K>(parent: Map<K, K>, rank: Map<K, number>, a: K, b: K): boolean {
	let rootA = find(parent, a);
	let rootB = find(parent, b);
	if (rootA === rootB) return false;
	if ((rank.get(rootA) as number) < (rank.get(rootB) as number)) [rootA, rootB] = [rootB, rootA];
	parent.set(rootB, rootA);
	if (rank.get(rootA) === rank.get(rootB)) rank.set(rootA, (rank.get(rootA) as number) + 1);
	return true;
}

commands.clear = () => {
	names.length = 0;
	out.clear();
	weight.clear();
	parents.clear();
	ranks.clear();
	redundantEdges.length = 0;
};

commands.edge = (args) => {
	const [a, b] = args;
	addNode(a);
	addNode(b);
	const targets = out.get(a) as string[];
	const w = args.length > 2 ? Number(args[2]) : 1;
	if (targets.includes(b)) {
		weight.set(`${a} ${b}`, Math.min(weight.get(`${a} ${b}`) as number, w)); // a repeated edge keeps the lighter weight
		return;
	}
	weight.set(`${a} ${b}`, w);
	targets.push(b);
	if (!union(parents, ranks, a, b)) redundantEdges.push(`${a}-${b}`);
};

commands.out = (args) => {
	printed.push((out.get(args[0]) ?? []).join(' '));
};

commands.has = (args) => {
	printed.push((out.get(args[0]) ?? []).includes(args[1]) ? 'yes' : 'no');
};

function edgeCount(): number {
	let total = 0;
	for (const targets of out.values()) total += targets.length;
	return total;
}

commands.count = () => {
	printed.push(`${names.length} ${edgeCount()}`);
};

commands.matrix = () => {
	for (const a of names) {
		const targets = new Set(out.get(a));
		printed.push(names.map((b) => (targets.has(b) ? '1' : '0')).join(' '));
	}
};

commands.cells = () => {
	const v = names.length;
	printed.push(`${v + edgeCount()} ${v * v}`);
};

/** The nodes of a path with the fewest edges from start to goal, or null. */
function shortestPath(start: string, goal: string): string[] | null {
	if (!out.has(start) || !out.has(goal)) return null;
	const cameFrom = new Map<string, string | null>([[start, null]]);
	const queue = [start];
	for (let head = 0; head < queue.length && !cameFrom.has(goal); head++) {
		const u = queue[head];
		for (const v of out.get(u) as string[]) {
			if (!cameFrom.has(v)) {
				cameFrom.set(v, u);
				queue.push(v);
			}
		}
	}
	if (!cameFrom.has(goal)) return null;
	const route: string[] = [];
	for (let node: string | null = goal; node !== null; node = cameFrom.get(node) as string | null) {
		route.push(node);
	}
	return route.reverse();
}

commands.path = (args) => {
	const route = shortestPath(args[0], args[1]);
	printed.push(route === null ? 'none' : route.join(' '));
};

commands.dfs = (args) => {
	if (!out.has(args[0])) {
		printed.push('');
		return;
	}
	const seen = new Set<string>();
	const visited: string[] = [];
	const stack = [args[0]];
	while (stack.length > 0) {
		const u = stack.pop() as string;
		if (seen.has(u)) continue;
		seen.add(u);
		visited.push(u);
		const targets = out.get(u) as string[];
		for (let i = targets.length - 1; i >= 0; i--) {
			// backwards, so the first edge is explored first
			if (!seen.has(targets[i])) stack.push(targets[i]);
		}
	}
	printed.push(visited.join(' '));
};

function inDegrees(): Map<string, number> {
	const degree = new Map<string, number>(names.map((n) => [n, 0]));
	for (const u of names) {
		for (const v of out.get(u) as string[]) degree.set(v, (degree.get(v) as number) + 1);
	}
	return degree;
}

commands.order = () => {
	const degree = inDegrees();
	const ready = new Heap<string>((a, b) => a < b); // the smallest ready name comes out first
	for (const n of names) if (degree.get(n) === 0) ready.push(n);
	const built: string[] = [];
	while (ready.size > 0) {
		const u = ready.pop();
		built.push(u);
		for (const v of out.get(u) as string[]) {
			const left = (degree.get(v) as number) - 1;
			degree.set(v, left);
			if (left === 0) ready.push(v);
		}
	}
	printed.push(built.length < names.length ? 'cycle' : built.join(' '));
};

commands.waves = () => {
	const degree = inDegrees();
	let wave = names.filter((n) => degree.get(n) === 0).sort();
	let built = 0;
	while (wave.length > 0) {
		printed.push(wave.join(' '));
		built += wave.length;
		const following: string[] = [];
		for (const u of wave) {
			for (const v of out.get(u) as string[]) {
				const left = (degree.get(v) as number) - 1;
				degree.set(v, left);
				if (left === 0) following.push(v);
			}
		}
		wave = following.sort();
	}
	if (built < names.length) printed.push('cycle');
};

commands.same = (args) => {
	const [a, b] = args;
	printed.push(
		parents.has(a) && parents.has(b) && find(parents, a) === find(parents, b) ? 'yes' : 'no'
	);
};

commands.groups = () => {
	printed.push(String(names.filter((n) => parents.get(n) === n).length));
};

commands.redundant = () => {
	printed.push(redundantEdges.length > 0 ? redundantEdges.join(' ') : 'none');
};

/** Dijkstra from start: the lowest total weight to every node it can reach. */
function search(start: string): Map<string, number> {
	const dist = new Map<string, number>([[start, 0]]);
	const heap = new Heap<[number, string]>((a, b) => a[0] < b[0]);
	heap.push([0, start]);
	while (heap.size > 0) {
		const [d, u] = heap.pop();
		if (d > (dist.get(u) as number)) continue; // a stale entry: u was reached more cheaply after this was pushed
		for (const v of out.get(u) as string[]) {
			const nd = d + (weight.get(`${u} ${v}`) as number);
			const known = dist.get(v);
			if (known === undefined || nd < known) {
				dist.set(v, nd);
				heap.push([nd, v]);
			}
		}
	}
	return dist;
}

commands.cost = (args) => {
	const [a, b] = args;
	const dist = out.has(a) ? search(a) : new Map<string, number>();
	printed.push(String(dist.get(b) ?? 'none'));
};

commands.farthest = (args) => {
	if (!out.has(args[0])) {
		printed.push('none');
		return;
	}
	const dist = search(args[0]);
	printed.push(dist.size === names.length ? String(Math.max(...dist.values())) : 'none');
};

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (printed.length > 0) console.log(printed.join('\n'));
