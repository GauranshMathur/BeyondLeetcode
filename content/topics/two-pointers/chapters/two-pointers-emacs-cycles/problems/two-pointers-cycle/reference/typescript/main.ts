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

commands.triples = () => {
	let count = 0;
	const n = values.length;
	for (let first = 0; first < n - 2; first++) {
		if (first > 0 && values[first] === values[first - 1]) continue;
		let lo = first + 1;
		let hi = n - 1;
		while (lo < hi) {
			const total = values[first] + values[lo] + values[hi];
			if (total < 0) {
				lo++;
			} else if (total > 0) {
				hi--;
			} else {
				count++;
				lo++;
				hi--;
				while (lo < hi && values[lo] === values[lo - 1]) lo++;
			}
		}
	}
	out.push(String(count));
};

commands.merge = (args) => {
	const split = Number(args[0]);
	const newer = values.slice(0, split);
	const older = values.slice(split);
	const merged: number[] = [];
	const sources: string[] = [];
	let i = 0;
	let j = 0;
	while (i < newer.length || j < older.length) {
		if (j === older.length || (i < newer.length && newer[i] <= older[j])) {
			if (j < older.length && newer[i] === older[j]) j++; // the older entry is hidden by the newer one
			merged.push(newer[i]);
			sources.push('N');
			i++;
		} else {
			merged.push(older[j]);
			sources.push('O');
			j++;
		}
	}
	values = merged;
	out.push(sources.join(' '));
};

commands.compact = () => {
	if (values.length === 0) {
		out.push('0');
		return;
	}
	let write = 1;
	for (let read = 1; read < values.length; read++) {
		if (values[read] !== values[read - 1]) {
			values[write] = values[read];
			write++;
		}
	}
	values.length = write;
	out.push(String(write));
};

commands.partition = (args) => {
	const pivot = Number(args[0]);
	let i = 0;
	let j = values.length - 1;
	for (;;) {
		while (i <= j && values[i] < pivot) i++;
		while (i <= j && values[j] >= pivot) j--;
		if (i > j) break;
		[values[i], values[j]] = [values[j], values[i]];
		i++;
		j--;
	}
	out.push(String(i));
};

// From here on the loaded numbers are a table of links: values[i] is the node that
// follows node i, or -1 when node i is the last one.
commands.middle = (args) => {
	let slow = Number(args[0]);
	let fast = slow;
	while (fast !== -1 && values[fast] !== -1) {
		slow = values[slow];
		fast = values[values[fast]];
	}
	out.push(String(slow));
};

commands.cycle = (args) => {
	const start = Number(args[0]);
	let slow = start;
	let fast = start;
	for (;;) {
		if (fast === -1 || values[fast] === -1) {
			out.push('none');
			return;
		}
		slow = values[slow];
		fast = values[values[fast]];
		if (slow === fast) break;
	}
	// Walking one pointer from the start and one from where they met,
	// both one step at a time, brings them together at the cycle's entry.
	let entry = start;
	let tail = 0;
	while (entry !== slow) {
		entry = values[entry];
		slow = values[slow];
		tail++;
	}
	let length = 1;
	let probe = values[entry];
	while (probe !== entry) {
		probe = values[probe];
		length++;
	}
	out.push(`${tail} ${length}`);
};

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
