import { readFileSync } from 'node:fs';

/** A binary min-heap of numbers: the parent of index i is (i - 1) >> 1. */
class MinHeap {
	private items: number[] = [];

	size(): number {
		return this.items.length;
	}

	push(x: number): void {
		const a = this.items;
		a.push(x);
		let i = a.length - 1;
		while (i > 0) {
			const parent = (i - 1) >> 1;
			if (a[parent] <= a[i]) break;
			[a[parent], a[i]] = [a[i], a[parent]];
			i = parent;
		}
	}

	pop(): number {
		const a = this.items;
		const top = a[0];
		const last = a.pop() as number;
		if (a.length > 0) {
			a[0] = last;
			let i = 0;
			for (;;) {
				const l = 2 * i + 1;
				const r = l + 1;
				let m = i;
				if (l < a.length && a[l] < a[m]) m = l;
				if (r < a.length && a[r] < a[m]) m = r;
				if (m === i) break;
				[a[m], a[i]] = [a[i], a[m]];
				i = m;
			}
		}
		return top;
	}
}

let values: number[] = []; // the sequence the commands work on
let jobs: [number, number][] = []; // (run time, deadline) pairs
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

commands.load = (args) => {
	values = args.map(Number);
};

commands.show = () => {
	out.push(values.join(' '));
};

commands.huffman = () => {
	const used = values.filter((x) => x > 0);
	if (used.length === 0) {
		out.push('0');
		return;
	}
	if (used.length === 1) {
		// zlib forces a second code, so the one symbol still costs one bit each time.
		out.push(String(used[0]));
		return;
	}
	const heap = new MinHeap();
	for (const x of used) heap.push(x);
	let total = 0;
	while (heap.size() > 1) {
		const merged = heap.pop() + heap.pop();
		total += merged; // every symbol below the new node gets one bit longer
		heap.push(merged);
	}
	out.push(String(total));
};

commands.jobs = (args) => {
	jobs = [];
	for (let i = 0; i + 1 < args.length; i += 2) jobs.push([Number(args[i]), Number(args[i + 1])]);
};

commands.edf = () => {
	let clock = 0;
	let worst = 0;
	// Earliest deadline first: run the jobs in order of deadline and track the largest tardiness.
	for (const [run, deadline] of [...jobs].sort((a, b) => a[1] - b[1])) {
		clock += run;
		worst = Math.max(worst, clock - deadline);
	}
	out.push(String(worst));
};

const parse = (lazy: boolean): void => {
	const n = values.length;
	let i = 0;
	let tokens = 0;
	while (i < n) {
		let length = values[i];
		if (length < 3) {
			tokens++; // a literal
			i++;
			continue;
		}
		if (lazy) {
			// A longer match at the next position beats this one: this position becomes a literal.
			while (i + 1 < n && values[i + 1] > length) {
				tokens++;
				i++;
				length = values[i];
			}
		}
		tokens++; // a match
		i += length;
	}
	out.push(String(tokens));
};
commands.greedy = () => parse(false);
commands.lazy = () => parse(true);

commands.reach = () => {
	const n = values.length;
	let jumps = 0;
	let end = 0;
	let far = 0;
	// `end` is the last position the jumps made so far can land on; `far` is the furthest
	// position that any position up to `end` could land on with one more jump.
	for (let i = 0; i < n; i++) {
		far = Math.max(far, i + Math.max(1, values[i]));
		if (i === end) {
			jumps++;
			end = far;
		}
	}
	out.push(String(jumps));
};

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
