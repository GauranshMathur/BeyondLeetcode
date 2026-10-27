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

commands.approx = (args) => {
	const k = Number(args[0]);
	const limit = Number(args[1]);
	let over = 0;
	let prev = 0; // total of the previous period
	let cur = 0; // total of this period so far
	for (let i = 0; i < values.length; i++) {
		if (i > 0 && i % k === 0) {
			prev = cur;
			cur = 0;
		}
		cur += values[i];
		const elapsed = (i % k) + 1;
		// estimate = prev * (k - elapsed) / k + cur, compared with limit after multiplying by k
		if (prev * (k - elapsed) + cur * k > limit * k) over++;
	}
	out.push(String(over));
};

commands.flight = (args) => {
	const cap = Number(args[0]);
	let lo = 0; // the window is values[lo..hi]
	let total = 0;
	let best = 0;
	for (let hi = 0; hi < values.length; hi++) {
		total += values[hi]; // the right edge moves out
		while (total > cap) {
			total -= values[lo]; // the left edge catches up
			lo++;
		}
		best = Math.max(best, hi - lo + 1);
	}
	out.push(String(best));
};

commands.shortest = (args) => {
	const need = Number(args[0]);
	let lo = 0;
	let total = 0;
	let best = 0;
	for (let hi = 0; hi < values.length; hi++) {
		total += values[hi];
		// while the window is big enough, record it, then let the left edge shrink it
		while (total >= need) {
			if (best === 0 || hi - lo + 1 < best) best = hi - lo + 1;
			total -= values[lo];
			lo++;
		}
	}
	out.push(String(best));
};

commands.bans = (args) => {
	const span = Number(args[0]);
	const limit = Number(args[1]);
	const counts = new Map<number, number>(); // host -> failures among the last `span` items
	const banned = new Set<number>();
	const order: number[] = [];
	for (let i = 0; i < values.length; i++) {
		const host = values[i];
		counts.set(host, (counts.get(host) ?? 0) + 1); // enters the window
		if (i >= span) {
			// the item `span` places back leaves it
			const old = values[i - span];
			const left = (counts.get(old) ?? 0) - 1;
			if (left === 0) counts.delete(old);
			else counts.set(old, left);
		}
		if ((counts.get(host) ?? 0) >= limit && !banned.has(host)) {
			banned.add(host);
			order.push(host);
		}
	}
	out.push(order.join(' '));
};

commands.distinct = () => {
	const last = new Map<number, number>(); // value -> index of its latest occurrence
	let lo = 0; // the window is values[lo..i]
	let best = 0;
	for (let i = 0; i < values.length; i++) {
		const seen = last.get(values[i]);
		if (seen !== undefined && seen >= lo) lo = seen + 1; // the left edge jumps past the earlier copy
		last.set(values[i], i);
		best = Math.max(best, i - lo + 1);
	}
	out.push(String(best));
};

commands.cover = (args) => {
	const need = new Map<number, number>(); // value -> how many copies the window must hold
	for (const a of args) need.set(Number(a), (need.get(Number(a)) ?? 0) + 1);
	const have = new Map<number, number>(); // value -> copies in the window now
	let short = need.size; // values that still have fewer copies than needed
	let lo = 0;
	let best = 0;
	for (let hi = 0; hi < values.length; hi++) {
		const v = values[hi];
		if (need.has(v)) {
			have.set(v, (have.get(v) ?? 0) + 1);
			if (have.get(v) === need.get(v)) short--;
		}
		while (short === 0) {
			if (best === 0 || hi - lo + 1 < best) best = hi - lo + 1;
			const u = values[lo];
			if (need.has(u)) {
				if (have.get(u) === need.get(u)) short++;
				have.set(u, (have.get(u) ?? 0) - 1);
			}
			lo++;
		}
	}
	out.push(String(best));
};

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
