import { readFileSync } from 'node:fs';

const names: string[] = []; // every node, in the order it first appeared
const out = new Map<string, string[]>(); // node -> the nodes it has an edge to, in the order added
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
	}
}

commands.clear = () => {
	names.length = 0;
	out.clear();
};

commands.edge = (args) => {
	const [a, b] = args;
	addNode(a);
	addNode(b);
	const targets = out.get(a) as string[];
	if (targets.includes(b)) return; // a repeated edge changes nothing
	targets.push(b);
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

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (printed.length > 0) console.log(printed.join('\n'));
