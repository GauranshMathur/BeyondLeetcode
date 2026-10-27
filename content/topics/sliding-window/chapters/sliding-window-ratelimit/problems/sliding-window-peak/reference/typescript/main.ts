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

commands.peak = (args) => {
	const n = values.length;
	if (n === 0) {
		out.push('0');
		return;
	}
	const k = Math.min(Number(args[0]), n);
	// Slide a window of k items: add the item that enters, subtract the one that leaves.
	let window = 0;
	for (let i = 0; i < k; i++) window += values[i];
	let best = window;
	for (let i = k; i < n; i++) {
		window += values[i] - values[i - k];
		best = Math.max(best, window);
	}
	out.push(String(best));
};

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
