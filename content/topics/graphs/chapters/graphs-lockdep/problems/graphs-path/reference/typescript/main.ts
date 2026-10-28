import { readFileSync } from 'node:fs';

const names: string[] = []; // every node, in the order it first appeared
const out = new Map<string, string[]>(); // node -> the nodes it has an edge to, in the order added
const printed: string[] = [];
const commands: Record<string, (args: string[]) => void> = {};

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

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (printed.length > 0) console.log(printed.join('\n'));
