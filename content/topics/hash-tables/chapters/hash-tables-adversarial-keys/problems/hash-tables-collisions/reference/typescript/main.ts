import { readFileSync } from 'node:fs';

const EMPTY = -1;
const DUMMY = -2;

type Key = number | string;
type Node = { key: Key; value: number };

let impl = 'cpython';
let resizeOn = false;
let moved = 0;

// CPython-style table: `slots` holds EMPTY, DUMMY or an index into `entries`.
let slots: number[] = new Array<number>(8).fill(EMPTY);
let entries: (Node | null)[] = []; // in insertion order; null once deleted
let used = 0;

// Java-style table: one list of nodes per bin.
let bins: Node[][] = Array.from({ length: 16 }, () => []);
let isTree: boolean[] = new Array<boolean>(16).fill(false);

function parseKey(token: string): Key {
	if (/^[A-Za-z]/.test(token)) return token;
	return Number(token);
}

/** The key's hash code as an unsigned 32-bit number. */
function javaHash(key: Key): number {
	if (typeof key === 'string') {
		let h = 0;
		for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) >>> 0;
		return h;
	}
	return key >>> 0;
}

function spread(h: number): number {
	return (h ^ (h >>> 16)) >>> 0;
}

function binIndex(key: Key): number {
	return (bins.length - 1) & spread(javaHash(key));
}

function makeTable(n: number): void {
	moved = 0;
	if (impl === 'cpython') {
		slots = new Array<number>(n).fill(EMPTY);
		entries = [];
		used = 0;
	}
	else {
		bins = Array.from({ length: n }, () => []);
		isTree = new Array<boolean>(n).fill(false);
	}
}

// ---- CPython-style open addressing ----

/** The next slot to look at: the recurrence from the Chapter. */
function nextSlot(i: number, perturb: number): [number, number] {
	const p = Math.floor(perturb / 32);
	return [(i * 5 + p + 1) & (slots.length - 1), p];
}

/** Returns [slot, entry index or -1, slots examined]. */
function cpFind(key: number): [number, number, number] {
	let i = key & (slots.length - 1);
	let perturb = key;
	let examined = 1;
	for (;;) {
		const ix = slots[i];
		if (ix === EMPTY) return [i, -1, examined];
		if (ix >= 0 && entries[ix]?.key === key) return [i, ix, examined];
		[i, perturb] = nextSlot(i, perturb);
		examined++;
	}
}

function bitLength(n: number): number {
	return n === 0 ? 0 : 32 - Math.clz32(n);
}

function cpResize(): void {
	const m = used * 3;
	const size = 1 << bitLength(((m | 8) - 1) | 7);
	const live = entries.filter((e): e is Node => e !== null);
	slots = new Array<number>(size).fill(EMPTY);
	entries = live;
	live.forEach((e, ix) => {
		let j = (e.key as number) & (size - 1);
		let perturb = e.key as number;
		while (slots[j] !== EMPTY) [j, perturb] = nextSlot(j, perturb);
		slots[j] = ix;
	});
	moved += live.length;
}

function cpPut(key: number, value: number): number {
	const [i, ix] = cpFind(key);
	if (ix >= 0) {
		(entries[ix] as Node).value = value;
		return i;
	}
	if (resizeOn && entries.length >= Math.floor((slots.length * 2) / 3)) cpResize();
	let j = key & (slots.length - 1);
	let perturb = key;
	while (slots[j] >= 0) [j, perturb] = nextSlot(j, perturb);
	slots[j] = entries.length;
	entries.push({ key, value });
	used++;
	return j;
}

function cpDel(key: number): boolean {
	const [i, ix] = cpFind(key);
	if (ix < 0) return false;
	slots[i] = DUMMY;
	entries[ix] = null;
	used--;
	return true;
}

// ---- Java-style chaining ----

function jbResize(): void {
	const oldCap = bins.length;
	const newBins: Node[][] = Array.from({ length: oldCap * 2 }, () => []);
	const newTree: boolean[] = new Array<boolean>(oldCap * 2).fill(false);
	bins.forEach((chain, j) => {
		const lo = chain.filter((n) => (spread(javaHash(n.key)) & oldCap) === 0);
		const hi = chain.filter((n) => (spread(javaHash(n.key)) & oldCap) !== 0);
		for (const [index, part] of [
			[j, lo],
			[j + oldCap, hi]
		] as [number, Node[]][]) {
			newBins[index] = part;
			newTree[index] = isTree[j] && part.length > 6;
		}
		moved += chain.length;
	});
	bins = newBins;
	isTree = newTree;
}

function jbPut(key: Key, value: number): number {
	const index = binIndex(key);
	const chain = bins[index];
	for (const node of chain) {
		if (node.key === key) {
			node.value = value;
			return index;
		}
	}
	chain.push({ key, value });
	if (!isTree[index] && chain.length >= 9) {
		if (bins.length < 64) jbResize();
		else isTree[index] = true;
	}
	if (resizeOn && bins.reduce((sum, c) => sum + c.length, 0) > Math.floor((bins.length * 3) / 4)) {
		jbResize();
	}
	return binIndex(key);
}

/** Returns the node (or null) and how many nodes the lookup visited. */
function jbFind(key: Key): [Node | null, number] {
	const chain = bins[binIndex(key)];
	for (let visited = 1; visited <= chain.length; visited++) {
		if (chain[visited - 1].key === key) return [chain[visited - 1], visited];
	}
	return [null, chain.length];
}

function signed32(h: number): number {
	return h | 0;
}

const out: string[] = [];
for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/);
	const cmd = parts[0];
	if (cmd === '') continue;
	if (cmd === 'table') {
		makeTable(Number(parts[1]));
	} else if (cmd === 'put') {
		const key = parseKey(parts[1]);
		if (impl === 'cpython') out.push(String(cpPut(key as number, Number(parts[2]))));
		else out.push(String(jbPut(key, Number(parts[2]))));
	} else if (cmd === 'get') {
		const key = parseKey(parts[1]);
		if (impl === 'cpython') {
			const [, ix] = cpFind(key as number);
			out.push(ix >= 0 ? String((entries[ix] as Node).value) : 'error');
		}
		else {
			const [node] = jbFind(key);
			out.push(node ? String(node.value) : 'error');
		}
	} else if (cmd === 'probes') {
		const key = parseKey(parts[1]);
		if (impl === 'cpython') out.push(String(cpFind(key as number)[2]));
		else out.push(String(jbFind(key)[1]));
	} else if (cmd === 'len') {
		if (impl === 'cpython') out.push(String(used));
		else out.push(String(bins.reduce((sum, c) => sum + c.length, 0)));
	} else if (cmd === 'cap') {
		if (impl === 'cpython') out.push(String(slots.length));
		else out.push(String(bins.length));
	} else if (cmd === 'dump') {
		if (impl === 'cpython') {
			out.push(
				slots
					.map((ix) => (ix === EMPTY ? '.' : ix === DUMMY ? 'x' : String((entries[ix] as Node).key)))
					.join(' ')
			);
		}
		else {
			bins.forEach((chain, index) => {
				if (chain.length === 0) return;
				if (isTree[index]) {
					out.push(`${index}: tree ${chain.length}`);
					return;
				}
				out.push(`${index}: ${chain.map((n) => String(n.key)).join(' ')}`);
			});
		}
	}
	else if (cmd === 'del') {
		out.push(cpDel(parseKey(parts[1]) as number) ? 'ok' : 'error');
	}
	else if (cmd === 'indices') {
		out.push(slots.map((ix) => (ix === EMPTY ? '.' : ix === DUMMY ? 'x' : String(ix))).join(' '));
	} else if (cmd === 'keys') {
		out.push(
			entries
				.filter((e): e is Node => e !== null)
				.map((e) => String(e.key))
				.join(' ')
		);
	} else if (cmd === 'nentries') {
		out.push(String(entries.length));
	}
	else if (cmd === 'impl') {
		impl = parts[1];
		makeTable(impl === 'cpython' ? 8 : 16);
	} else if (cmd === 'bin') {
		out.push(String(binIndex(parseKey(parts[1]))));
	} else if (cmd === 'longest') {
		out.push(String(Math.max(...bins.map((c) => c.length))));
	}
	else if (cmd === 'trees') {
		out.push(String(isTree.filter(Boolean).length));
	}
	else if (cmd === 'resize') {
		resizeOn = parts[1] === 'on';
	} else if (cmd === 'moved') {
		out.push(String(moved));
	}
	else if (cmd === 'hashcode') {
		out.push(String(signed32(javaHash(parts[1]))));
	}
	else if (cmd === 'collide') {
		const i = Number(parts[1]);
		let s = '';
		for (let j = 0; j < 10; j++) s += (i >> (9 - j)) & 1 ? 'BB' : 'Aa';
		out.push(s);
	}
}
if (out.length > 0) console.log(out.join('\n'));
