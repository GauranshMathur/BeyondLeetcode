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

commands.add = (args) => {
	placeRange(Number(args[0]), Number(args[1]));
};

commands.place = (args) => {
	placeRange(Number(args[0]), Number(args[1]));
	out.push(`${regions.length} ${covered}`);
};

commands.cut = (args) => {
	const a = Number(args[0]);
	const b = Number(args[1]);
	const i = firstReaching(a); // the first region that reaches [a, b]
	let j = i;
	const pieces: Range[] = [];
	while (j < regions.length && regions[j][0] <= b) {
		const [lo, hi] = regions[j];
		covered -= hi - lo + 1;
		if (lo < a) {
			pieces.push([lo, a - 1]);
			covered += a - lo;
		}
		if (hi > b) {
			pieces.push([b + 1, hi]);
			covered += hi - b;
		}
		j++;
	}
	regions.splice(i, j - i, ...pieces);
	out.push(`${regions.length} ${covered}`);
};

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
