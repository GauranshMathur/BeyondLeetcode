import { readFileSync } from 'node:fs';

const MOD = 1_000_000_007;
let values: number[] = []; // the sequence the commands work on
const out: string[] = [];
const commands: Record<string, (args: string[]) => void> = {};

commands.load = (args) => {
	values = args.map(Number);
};

commands.show = () => {
	out.push(values.join(' '));
};

commands.ways = (args) => {
	const n = Number(args[0]);
	const table = new Array<number>(n + 1).fill(0); // table[m]: ways to climb m steps, modulo MOD
	table[0] = 1;
	for (let m = 1; m <= n; m++) {
		let total = 0;
		for (const step of values) if (step <= m) total += table[m - step];
		table[m] = total % MOD;
	}
	out.push(String(table[n]));
};

/** Cheapest cost of laying the words out in lines of `width`, or null if no layout is allowed. */
function layOut(width: number, tolerance: number): number | null {
	const n = values.length;
	const best: (number | null)[] = new Array(n + 1).fill(null); // best[j]: cheapest cost of the first j words
	best[0] = 0;
	for (let j = 1; j <= n; j++) {
		let used = -1; // the line holds words i-1 .. j-1, with a space between neighbours
		for (let i = j; i > 0; i--) {
			used += values[i - 1] + 1;
			if (used > width) break;
			const slack = width - used;
			if (j < n && slack > tolerance) continue; // too loose, and not the last line
			const before = best[i - 1];
			if (before === null) continue;
			const cost = before + (j === n ? 0 : slack ** 3);
			const now = best[j];
			if (now === null || cost < now) best[j] = cost;
		}
	}
	return best[n];
}

commands.wrap = (args) => {
	out.push(String(layOut(Number(args[0]), Number(args[0])) ?? -1));
};

commands.tolerant = (args) => {
	out.push(String(layOut(Number(args[0]), Number(args[1])) ?? -1));
};

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
