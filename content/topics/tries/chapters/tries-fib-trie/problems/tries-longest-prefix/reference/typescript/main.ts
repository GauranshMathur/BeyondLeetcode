import { readFileSync } from 'node:fs';

/** One node of the trie. The edge that leads to it is stored in its parent. */
class TrieNode {
	kids = new Map<string, TrieNode>(); // next character -> child node
	value: number | null = null; // the stored value, or null when no key ends here
}

const root = new TrieNode();
const out: string[] = [];

/** A node of the route table: a trie over the 32 bits of an address, one bit per level. */
interface RouteNode {
	kids: [RouteNode | null, RouteNode | null];
	text: string | null;
}
const routeRoot: RouteNode = { kids: [null, null], text: null };

function add(key: string, value: number): void {
	let node = root;
	for (const ch of key) {
		let next = node.kids.get(ch);
		if (next === undefined) {
			next = new TrieNode();
			node.kids.set(ch, next);
		}
		node = next;
	}
	node.value = value;
}

function find(key: string): TrieNode | undefined {
	let node: TrieNode | undefined = root;
	for (const ch of key) {
		node = node.kids.get(ch);
		if (node === undefined) return undefined;
	}
	return node;
}

function remove(key: string): number {
	const path: TrieNode[] = [root];
	for (const ch of key) {
		const next = path[path.length - 1].kids.get(ch);
		if (next === undefined) return 0;
		path.push(next);
	}
	if (path[path.length - 1].value === null) return 0;
	path[path.length - 1].value = null;
	// Cut every node that no longer leads to a key.
	for (let i = key.length; i > 0; i--) {
		const node = path[i];
		if (node.kids.size > 0 || node.value !== null) break;
		path[i - 1].kids.delete(key[i - 1]);
	}
	return 1;
}

/** Every [key, node] under `start` in key order, `start` included. */
function walk(start: TrieNode = root): [string, TrieNode][] {
	const result: [string, TrieNode][] = [];
	const stack: [string, TrieNode][] = [['', start]];
	while (stack.length > 0) {
		const [key, node] = stack.pop() as [string, TrieNode];
		result.push([key, node]);
		for (const ch of [...node.kids.keys()].sort().reverse()) {
			stack.push([key + ch, node.kids.get(ch) as TrieNode]);
		}
	}
	return result;
}

/** Nodes left when each chain of single-child, non-key nodes shares one node. */
function compressedNodes(): number {
	let absorbed = 0;
	for (const [, node] of walk()) {
		if (node.kids.size === 1) {
			const child = [...node.kids.values()][0];
			if (child.kids.size === 1 && child.value === null) absorbed++;
		}
	}
	return walk().length - absorbed;
}

function parseCidr(text: string): [number, number] {
	const [address, length] = text.split('/');
	const [a, b, c, d] = address.split('.').map(Number);
	return [((a << 24) | (b << 16) | (c << 8) | d) >>> 0, Number(length)];
}

function route(text: string, value: string): void {
	const [address, length] = parseCidr(text);
	if (length < 32 && (address & (2 ** (32 - length) - 1)) !== 0) {
		out.push('error');
		return;
	}
	let node = routeRoot;
	for (let i = 0; i < length; i++) {
		const bit = (address >>> (31 - i)) & 1;
		let next = node.kids[bit];
		if (next === null) {
			next = { kids: [null, null], text: null };
			node.kids[bit] = next;
		}
		node = next;
	}
	node.text = `${text} ${value}`;
}

function match(text: string): void {
	const [address] = parseCidr(`${text}/32`);
	let node: RouteNode | null = routeRoot;
	let best = node.text;
	for (let i = 0; i < 32; i++) {
		node = node.kids[(address >>> (31 - i)) & 1];
		if (node === null) break;
		if (node.text !== null) best = node.text;
	}
	out.push(best ?? 'none');
}

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/);
	const command = parts[0];
	if (command === 'add') {
		add(parts[1], Number(parts[2]));
	} else if (command === 'get') {
		const node = find(parts[1]);
		out.push(node !== undefined && node.value !== null ? String(node.value) : 'none');
	} else if (command === 'del') {
		out.push(String(remove(parts[1])));
	} else if (command === 'nodes') {
		out.push(String(walk().length));
	} else if (command === 'size') {
		out.push(String(walk().filter(([, node]) => node.value !== null).length));
	} else if (command === 'rnodes') {
		out.push(String(compressedNodes()));
	} else if (command === 'route') {
		route(parts[1], parts[2]);
	} else if (command === 'match') {
		match(parts[1]);
	}
}
if (out.length > 0) console.log(out.join('\n'));
