import { readFileSync } from 'node:fs';

const out: string[] = [];
const commands: Record<string, (args: string[]) => void> = {};

type Range = [number, number];

const ivs: Range[] = []; // every interval added so far, as [lo, hi]

function fmt(ranges: Range[]): string {
	return ranges.length > 0 ? ranges.map(([lo, hi]) => `${lo}-${hi}`).join(' ') : 'none';
}

commands.add = (args) => {
	ivs.push([Number(args[0]), Number(args[1])]);
};

function mergeAll(): Range[] {
	// Sort by start, then fold each interval into the last range when it overlaps or abuts it.
	const sorted = ivs.map(([lo, hi]): Range => [lo, hi]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
	const merged: Range[] = [];
	for (const [lo, hi] of sorted) {
		const last = merged[merged.length - 1];
		if (last !== undefined && lo <= last[1] + 1) last[1] = Math.max(last[1], hi);
		else merged.push([lo, hi]);
	}
	return merged;
}

commands.merged = () => {
	out.push(fmt(mergeAll()));
};

commands.gaps = (args) => {
	const lo = Number(args[0]);
	const hi = Number(args[1]);
	const gaps: Range[] = [];
	let next = lo; // the first integer not yet known to be covered or gapped
	for (const [a, b] of mergeAll()) {
		if (b < next) continue;
		if (a > hi) break;
		if (a > next) gaps.push([next, a - 1]);
		next = b + 1;
	}
	if (next <= hi) gaps.push([next, hi]);
	out.push(fmt(gaps));
};

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
