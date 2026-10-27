import { readFileSync } from 'node:fs';

let values: number[] = []; // the sequence the commands work on
const out: string[] = [];
const commands: Record<string, (args: string[]) => void> = {};

commands.load = (args) => {
	values = args.map(Number);
};

commands.show = () => {
	out.push(values.join(' '));
};

commands.blocks = (args) => {
	const k = Number(args[0]);
	if (values.length === 0) {
		out.push('0');
		return;
	}
	let best = Number.NEGATIVE_INFINITY;
	for (let start = 0; start < values.length; start += k) {
		let total = 0;
		for (let i = start; i < Math.min(start + k, values.length); i++) total += values[i];
		best = Math.max(best, total);
	}
	out.push(String(best));
};

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
