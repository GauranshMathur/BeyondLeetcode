import { readFileSync } from 'node:fs';

const out: string[] = [];
const commands: Record<string, (args: string[]) => void> = {};

type Range = [number, number];

const regions: Range[] = []; // merged ranges as [lo, hi], sorted, none overlapping or abutting
let covered = 0; // how many integers the regions hold

function fmt(ranges: Range[]): string {
	return ranges.length > 0 ? ranges.map(([lo, hi]) => `${lo}-${hi}`).join(' ') : 'none';
}

// Binary search: the index of the first region whose hi is at least x.
function firstReaching(x: number): number {
	let lo = 0;
	let hi = regions.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (regions[mid][1] >= x) hi = mid;
		else lo = mid + 1;
	}
	return lo;
}

function placeRange(lo0: number, hi0: number) {
	let a = lo0;
	let b = hi0;
	const i = firstReaching(a - 1); // the first region that overlaps or abuts [a, b] on the left
	let j = i;
	while (j < regions.length && regions[j][0] <= b + 1) {
		a = Math.min(a, regions[j][0]);
		b = Math.max(b, regions[j][1]);
		covered -= regions[j][1] - regions[j][0] + 1;
		j++;
	}
	regions.splice(i, j - i, [a, b]);
	covered += b - a + 1;
}

commands.merged = () => {
	out.push(fmt(regions));
};

const ivs: Range[] = []; // every interval added or placed, as [lo, hi], in the order they came
let order: Range[] = []; // the intervals sorted by lo; equal lo keep the order they came in
let sub: number[] = []; // sub[m] is the largest hi in the part of `order` that m is the middle of
let dirty = false; // whether `ivs` changed since `order` was built

commands.add = (args) => {
	const a = Number(args[0]);
	const b = Number(args[1]);
	ivs.push([a, b]);
	dirty = true;
	placeRange(a, b);
};

commands.place = (args) => {
	commands.add(args);
	out.push(`${regions.length} ${covered}`);
};

// The middle item of order[lo, hi) is the root of that part; returns its index (-1 if empty).
function build(lo: number, hi: number): number {
	if (lo >= hi) return -1;
	const mid = (lo + hi) >> 1;
	let best = order[mid][1];
	for (const child of [build(lo, mid), build(mid + 1, hi)]) {
		if (child >= 0) best = Math.max(best, sub[child]);
	}
	sub[mid] = best;
	return mid;
}

function search(lo: number, hi: number, a: number, b: number, found: Range[]) {
	if (lo >= hi) return;
	const mid = (lo + hi) >> 1;
	if (sub[mid] < a) return; // nothing in this part reaches a
	search(lo, mid, a, b, found);
	if (order[mid][0] <= b) {
		// otherwise this item and everything after it starts too late
		if (order[mid][1] >= a) found.push(order[mid]);
		search(mid + 1, hi, a, b, found);
	}
}

commands.find = (args) => {
	const a = Number(args[0]);
	const b = Number(args[1]);
	if (dirty) {
		order = [...ivs].sort((x, y) => x[0] - y[0]); // stable
		sub = new Array<number>(order.length).fill(0);
		build(0, order.length);
		dirty = false;
	}
	const found: Range[] = [];
	search(0, order.length, a, b, found);
	out.push(fmt(found));
};

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
