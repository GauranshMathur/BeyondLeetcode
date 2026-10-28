import { readFileSync } from 'node:fs';

interface TreeNode {
	value: number;
	left: TreeNode | null;
	right: TreeNode | null;
}

let root: TreeNode | null = null; // the tree the commands work on
const out: string[] = [];
const commands: Record<string, (args: string[]) => void> = {};

function makeNode(value: number): TreeNode {
	return { value, left: null, right: null };
}

/** Reads a tree from tokens in level order. `-` is an absent child. */
function build(tokens: string[]): TreeNode | null {
	if (tokens.length === 0 || tokens[0] === '-') return null;
	const top = makeNode(Number(tokens[0]));
	const queue = [top];
	let pos = 1;
	for (let head = 0; head < queue.length; head++) {
		const node = queue[head];
		if (pos < tokens.length) {
			const token = tokens[pos++];
			if (token !== '-') {
				node.left = makeNode(Number(token));
				queue.push(node.left);
			}
		}
		if (pos < tokens.length) {
			const token = tokens[pos++];
			if (token !== '-') {
				node.right = makeNode(Number(token));
				queue.push(node.right);
			}
		}
	}
	return top;
}

function heightOf(node: TreeNode | null): number {
	if (node === null) return 0;
	return 1 + Math.max(heightOf(node.left), heightOf(node.right));
}

commands.show = () => {
	const tokens: string[] = [];
	const queue: (TreeNode | null)[] = [root];
	for (let head = 0; head < queue.length; head++) {
		const node = queue[head];
		if (node === null) {
			tokens.push('-');
		} else {
			tokens.push(String(node.value));
			queue.push(node.left, node.right);
		}
	}
	while (tokens.length > 0 && tokens[tokens.length - 1] === '-') tokens.pop();
	out.push(tokens.join(' '));
};

commands.height = () => {
	out.push(String(heightOf(root)));
};

let maxHeight: number | null = null; // the tallest tree `tree` may load; null means no limit

/** Makes `next` the tree, unless it is taller than the limit. */
function accept(next: TreeNode | null) {
	if (maxHeight !== null && heightOf(next) > maxHeight) {
		out.push('too deep');
		return;
	}
	root = next;
}

commands.tree = (args) => {
	accept(build(args));
};

commands.limit = (args) => {
	maxHeight = args[0] === 'off' ? null : Number(args[0]);
};

function insertValue(value: number) {
	if (root === null) {
		root = makeNode(value);
		return;
	}
	let node = root;
	while (true) {
		if (value < node.value) {
			if (node.left === null) {
				node.left = makeNode(value);
				return;
			}
			node = node.left;
		} else if (value > node.value) {
			if (node.right === null) {
				node.right = makeNode(value);
				return;
			}
			node = node.right;
		} else {
			return; // already there
		}
	}
}

commands.insert = (args) => {
	for (const token of args) insertValue(Number(token));
};

commands.find = (args) => {
	const value = Number(args[0]);
	let node = root;
	let visited = 0;
	while (node !== null) {
		visited++;
		if (value < node.value) {
			node = node.left;
		} else if (value > node.value) {
			node = node.right;
		} else {
			out.push(`found ${visited}`);
			return;
		}
	}
	out.push(`missing ${visited}`);
};

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
