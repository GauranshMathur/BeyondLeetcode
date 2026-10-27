import { readFileSync } from 'node:fs';

const EMPTY = -1;
const DUMMY = -2;

type Key = number;
type Node = { key: Key; value: number };

let impl = 'cpython';

// CPython-style table: `slots` holds EMPTY, DUMMY or an index into `entries`.
let slots: number[] = new Array<number>(8).fill(EMPTY);
let entries: (Node | null)[] = []; // in insertion order; null once deleted
let used = 0;

// Java-style table: one list of nodes per bin.
let bins: Node[][] = Array.from({ length: 16 }, () => []);
let nodes = 0;

function parseKey(token: string): Key {
	return Number(token);
}

/** The key's hash code as an unsigned 32-bit number. */
function javaHash(key: Key): number {
	return key >>> 0;
}

function spread(h: number): number {
	return (h ^ (h >>> 16)) >>> 0;
}

function binIndex(key: Key): number {
	return (bins.length - 1) & spread(javaHash(key));
}

function makeTable(n: number): void {
	nodes = 0;
	if (impl === 'cpython') {
		slots = new Array<number>(n).fill(EMPTY);
		entries = [];
		used = 0;
	} else {
		bins = Array.from({ length: n }, () => []);
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

function cpPut(key: number, value: number): number {
	const [i, ix] = cpFind(key);
	if (ix >= 0) {
		(entries[ix] as Node).value = value;
		return i;
	}
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
	nodes++;
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
		} else {
			const [node] = jbFind(key);
			out.push(node ? String(node.value) : 'error');
		}
	} else if (cmd === 'probes') {
		const key = parseKey(parts[1]);
		if (impl === 'cpython') out.push(String(cpFind(key as number)[2]));
		else out.push(String(jbFind(key)[1]));
	} else if (cmd === 'len') {
		if (impl === 'cpython') out.push(String(used));
		else out.push(String(nodes));
	} else if (cmd === 'cap') {
		if (impl === 'cpython') out.push(String(slots.length));
		else out.push(String(bins.length));
	} else if (cmd === 'dump') {
		if (impl === 'cpython') {
			out.push(
				slots
					.map((ix) =>
						ix === EMPTY ? '.' : ix === DUMMY ? 'x' : String((entries[ix] as Node).key)
					)
					.join(' ')
			);
		} else {
			bins.forEach((chain, index) => {
				if (chain.length === 0) return;
				out.push(`${index}: ${chain.map((n) => String(n.key)).join(' ')}`);
			});
		}
	} else if (cmd === 'del') {
		out.push(cpDel(parseKey(parts[1]) as number) ? 'ok' : 'error');
	} else if (cmd === 'indices') {
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
	} else if (cmd === 'impl') {
		impl = parts[1];
		makeTable(impl === 'cpython' ? 8 : 16);
	} else if (cmd === 'bin') {
		out.push(String(binIndex(parseKey(parts[1]))));
	} else if (cmd === 'longest') {
		out.push(String(Math.max(...bins.map((c) => c.length))));
	}
}
if (out.length > 0) console.log(out.join('\n'));
