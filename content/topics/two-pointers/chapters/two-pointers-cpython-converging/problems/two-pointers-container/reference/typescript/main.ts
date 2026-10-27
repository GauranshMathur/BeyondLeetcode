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

commands.reverse = () => {
	// Two pointers start at the ends and swap, moving toward each other.
	let lo = 0;
	let hi = values.length - 1;
	while (lo < hi) {
		[values[lo], values[hi]] = [values[hi], values[lo]];
		lo++;
		hi--;
	}
};

commands.trim = () => {
	let lo = 0;
	let hi = values.length;
	while (lo < hi && values[lo] === 0) lo++;
	while (hi > lo && values[hi - 1] === 0) hi--;
	out.push(String(values.length - (hi - lo)));
	values = values.slice(lo, hi);
};

commands.palindrome = () => {
	let lo = 0;
	let hi = values.length - 1;
	while (lo < hi) {
		if (values[lo] === 0) {
			lo++;
		} else if (values[hi] === 0) {
			hi--;
		} else if (values[lo] !== values[hi]) {
			out.push('no');
			return;
		} else {
			lo++;
			hi--;
		}
	}
	out.push('yes');
};

commands.pairsum = (args) => {
	const target = Number(args[0]);
	let lo = 0;
	let hi = values.length - 1;
	while (lo < hi) {
		const total = values[lo] + values[hi];
		if (total === target) {
			out.push(`${lo + 1} ${hi + 1}`);
			return;
		}
		if (total < target) lo++;
		else hi--;
	}
	out.push('none');
};

commands.water = () => {
	let lo = 0;
	let hi = values.length - 1;
	let best = 0;
	while (lo < hi) {
		best = Math.max(best, (hi - lo) * Math.min(values[lo], values[hi]));
		if (values[lo] <= values[hi]) lo++;
		else hi--;
	}
	out.push(String(best));
};

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
