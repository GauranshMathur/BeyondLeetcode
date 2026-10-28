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

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
