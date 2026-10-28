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

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (printed.length > 0) console.log(printed.join('\n'));
