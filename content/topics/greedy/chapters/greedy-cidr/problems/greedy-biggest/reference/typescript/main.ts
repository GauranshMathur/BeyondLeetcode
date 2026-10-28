import { readFileSync } from 'node:fs';

const out: string[] = [];
const commands: Record<string, (args: string[]) => void> = {};

commands.cidr = (args) => {
	let first = Number(args[0]);
	const last = Number(args[1]);
	let count = 0;
	while (first <= last) {
		// The biggest block that starts at `first`: 2^k numbers, `first` a multiple of 2^k, ending by `last`.
		let size = 1;
		while (first % (size * 2) === 0 && first + size * 2 - 1 <= last) size *= 2;
		first += size;
		count++;
	}
	out.push(String(count));
};

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
