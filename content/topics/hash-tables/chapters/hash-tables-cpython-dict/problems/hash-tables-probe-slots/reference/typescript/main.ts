import { readFileSync } from 'node:fs';

const EMPTY = -1;
const DUMMY = -2;

type Key = number;
type Node = { key: Key; value: number };

const impl = 'cpython';

// CPython-style table: `slots` holds EMPTY, DUMMY or an index into `entries`.
let slots: number[] = new Array<number>(8).fill(EMPTY);
let entries: (Node | null)[] = []; // in insertion order; null once deleted
let used = 0;

function parseKey(token: string): Key {
	return Number(token);
}

function makeTable(n: number): void {
	if (impl === 'cpython') {
		slots = new Array<number>(n).fill(EMPTY);
		entries = [];
		used = 0;
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
	} else if (cmd === 'get') {
		const key = parseKey(parts[1]);
		if (impl === 'cpython') {
			const [, ix] = cpFind(key as number);
			out.push(ix >= 0 ? String((entries[ix] as Node).value) : 'error');
		}
	} else if (cmd === 'probes') {
		const key = parseKey(parts[1]);
		if (impl === 'cpython') out.push(String(cpFind(key as number)[2]));
	} else if (cmd === 'len') {
		if (impl === 'cpython') out.push(String(used));
	} else if (cmd === 'cap') {
		if (impl === 'cpython') out.push(String(slots.length));
	} else if (cmd === 'dump') {
		if (impl === 'cpython') {
			out.push(
				slots
					.map((ix) =>
						ix === EMPTY ? '.' : ix === DUMMY ? 'x' : String((entries[ix] as Node).key)
					)
					.join(' ')
			);
		}
	}
}
if (out.length > 0) console.log(out.join('\n'));
