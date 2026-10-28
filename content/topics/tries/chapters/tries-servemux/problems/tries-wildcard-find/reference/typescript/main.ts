import { readFileSync } from 'node:fs';

/** One node of the trie. The edge that leads to it is stored in its parent. */
class TrieNode {
	kids = new Map<string, TrieNode>(); // next character -> child node
	value: number | null = null; // the stored value, or null when no key ends here
}

const root = new TrieNode();
const out: string[] = [];

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

function countMatches(node: TrieNode, pattern: string, i: number): number {
	if (i === pattern.length) return node.value !== null ? 1 : 0;
	if (pattern[i] === '.') {
		let total = 0;
		for (const child of node.kids.values()) total += countMatches(child, pattern, i + 1);
		return total;
	}
	const child = node.kids.get(pattern[i]);
	return child === undefined ? 0 : countMatches(child, pattern, i + 1);
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
	} else if (command === 'find') {
		out.push(String(countMatches(root, parts[1], 0)));
	}
}
if (out.length > 0) console.log(out.join('\n'));
