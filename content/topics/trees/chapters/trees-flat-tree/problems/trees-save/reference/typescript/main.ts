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

/** Whether every value below node is above `low` and below `high` (null: no bound). */
function isSearchTree(node: TreeNode | null, low: number | null, high: number | null): boolean {
	if (node === null) return true;
	if (low !== null && node.value <= low) return false;
	if (high !== null && node.value >= high) return false;
	return isSearchTree(node.left, low, node.value) && isSearchTree(node.right, node.value, high);
}

commands.validate = () => {
	out.push(isSearchTree(root, null, null) ? 'valid' : 'invalid');
};

const MAX_KEYS = 3; // a B-tree node holds at most this many keys

interface BNode {
	keys: number[];
	children: BNode[]; // empty for a leaf, else one more than keys
}

let btree: BNode | null = null;

/** Adds key below node. If node splits, returns the key to move up and the new right node. */
function btInsert(node: BNode, key: number): { up: number; right: BNode } | null {
	let i = 0;
	while (i < node.keys.length && node.keys[i] < key) i++;
	if (i < node.keys.length && node.keys[i] === key) return null;
	if (node.children.length > 0) {
		const split = btInsert(node.children[i], key);
		if (split === null) return null;
		node.keys.splice(i, 0, split.up);
		node.children.splice(i + 1, 0, split.right);
	} else {
		node.keys.splice(i, 0, key);
	}
	if (node.keys.length <= MAX_KEYS) return null;
	// Four keys: the second moves up, the first stays, the last two go to a new node.
	const up = node.keys[1];
	const right: BNode = { keys: node.keys.slice(2), children: node.children.slice(2) };
	node.keys = node.keys.slice(0, 1);
	node.children = node.children.slice(0, 2);
	return { up, right };
}

function btAdd(key: number) {
	if (btree === null) {
		btree = { keys: [key], children: [] };
		return;
	}
	const split = btInsert(btree, key);
	if (split !== null) btree = { keys: [split.up], children: [btree, split.right] };
}

commands.bt = (args) => {
	if (args[0] === 'add') {
		for (const token of args.slice(1)) btAdd(Number(token));
	} else if (args[0] === 'show') {
		let level: BNode[] = btree === null ? [] : [btree];
		while (level.length > 0) {
			out.push(level.map((n) => `[${n.keys.join(' ')}]`).join(' '));
			level = level.flatMap((n) => n.children);
		}
	} else if (args[0] === 'find') {
		const key = Number(args[1]);
		let node = btree;
		let read = 0;
		while (node !== null) {
			read++;
			let i = 0;
			while (i < node.keys.length && node.keys[i] < key) i++;
			if (i < node.keys.length && node.keys[i] === key) {
				out.push(`found ${read}`);
				return;
			}
			node = node.children.length > 0 ? node.children[i] : null;
		}
		out.push(`missing ${read}`);
	}
};

commands.walk = (args) => {
	const order = args[0];
	const values: number[] = [];
	const visit = (node: TreeNode | null) => {
		if (node === null) return;
		if (order === 'pre') values.push(node.value);
		visit(node.left);
		if (order === 'in') values.push(node.value);
		visit(node.right);
		if (order === 'post') values.push(node.value);
	};
	visit(root);
	out.push(values.join(' '));
};

/** Yields the nodes of each level, from the root down, one level at a time. */
function* levelsOf(top: TreeNode | null): Generator<TreeNode[]> {
	let level: TreeNode[] = top === null ? [] : [top];
	while (level.length > 0) {
		yield level;
		const next: TreeNode[] = [];
		for (const node of level) {
			if (node.left !== null) next.push(node.left);
			if (node.right !== null) next.push(node.right);
		}
		level = next;
	}
}

commands.levels = () => {
	for (const level of levelsOf(root)) out.push(level.map((n) => n.value).join(' '));
};

/** Adds to path the nodes from node down to the one holding value. Returns whether it is there. */
function pathTo(node: TreeNode | null, value: number, path: TreeNode[]): boolean {
	if (node === null) return false;
	path.push(node);
	if (node.value === value || pathTo(node.left, value, path) || pathTo(node.right, value, path)) {
		return true;
	}
	path.pop();
	return false;
}

commands.lca = (args) => {
	const first: TreeNode[] = [];
	const second: TreeNode[] = [];
	if (!(pathTo(root, Number(args[0]), first) && pathTo(root, Number(args[1]), second))) {
		out.push('none');
		return;
	}
	let common = first[0];
	for (let i = 0; i < Math.min(first.length, second.length) && first[i] === second[i]; i++) {
		common = first[i];
	}
	out.push(String(common.value));
};

function encode(node: TreeNode | null, parts: string[]) {
	if (node === null) {
		parts.push('.');
		return;
	}
	parts.push(`(${node.value} `);
	encode(node.left, parts);
	parts.push(' ');
	encode(node.right, parts);
	parts.push(')');
}

/** Reads one subtree starting at text[pos]. Returns it and the position after it. */
function decode(text: string, pos: number): [TreeNode | null, number] {
	if (text[pos] === '.') return [null, pos + 1];
	const end = text.indexOf(' ', pos);
	const node = makeNode(Number(text.slice(pos + 1, end)));
	[node.left, pos] = decode(text, end + 1);
	[node.right, pos] = decode(text, pos + 1);
	return [node, pos + 1]; // skip the ")"
}

commands.save = () => {
	const parts: string[] = [];
	encode(root, parts);
	out.push(parts.join(''));
};

commands.restore = (args) => {
	accept(decode(args.join(' '), 0)[0]);
};

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
