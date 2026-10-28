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

commands.wrap = (args) => {
	const width = Number(args[0]);
	const n = values.length;
	const best: (number | null)[] = new Array(n + 1).fill(null); // best[j]: cheapest cost of the first j words, null if impossible
	best[0] = 0;
	for (let j = 1; j <= n; j++) {
		let used = -1; // the line holds words i-1 .. j-1, with a space between neighbours
		for (let i = j; i > 0; i--) {
			used += values[i - 1] + 1;
			if (used > width) break;
			const before = best[i - 1];
			if (before === null) continue;
			const cost = before + (j === n ? 0 : (width - used) ** 3);
			const now = best[j];
			if (now === null || cost < now) best[j] = cost;
		}
	}
	out.push(String(best[n] ?? -1));
};

commands.pick = () => {
	let before = 0; // best total over the items up to two back
	let best = 0; // and up to one back
	for (const v of values) [before, best] = [best, Math.max(best, before + v)];
	out.push(String(best));
};

commands.spread = (args) => {
	const k = Number(args[0]);
	const ring = new Array<number>(k).fill(0); // ring[j % k]: best total over the first j items, for the last k values of j
	let best = 0;
	for (let i = 1; i <= values.length; i++) {
		best = Math.max(best, ring[i % k] + values[i - 1]); // ring[i % k] still holds the total k items back
		ring[i % k] = best;
	}
	out.push(String(best));
};

commands.fewest = (args) => {
	const amount = Number(args[0]);
	const table: (number | null)[] = new Array(amount + 1).fill(null); // table[m]: fewest items that sum to m, null if none do
	table[0] = 0;
	for (let m = 1; m <= amount; m++) {
		for (const item of values) {
			const prev = table[m - item];
			if (item <= m && prev !== null && (table[m] === null || prev + 1 < table[m])) {
				table[m] = prev + 1;
			}
		}
	}
	out.push(String(table[amount] ?? -1));
};

commands.decode = () => {
	let before = 0; // splits of the first i-1 digits
	let best = 1; // and of the first i digits, for i = 0
	for (let i = 0; i < values.length; i++) {
		const d = values[i];
		let total = d !== 0 ? best : 0; // d alone as a token
		if (i > 0 && values[i - 1] * 10 + d >= 10 && values[i - 1] * 10 + d <= 26) {
			total += before; // the last two digits as one token
		}
		[before, best] = [best, total % MOD];
	}
	out.push(String(best));
};

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
