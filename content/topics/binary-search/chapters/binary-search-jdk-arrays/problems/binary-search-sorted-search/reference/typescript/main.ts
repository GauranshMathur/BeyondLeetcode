import { readFileSync } from 'node:fs';

/** Java's (low + high) / 2 in 32-bit signed arithmetic: the sum wraps, the division truncates toward zero. */
function naiveMid(low: number, high: number): number {
	const total = (low + high) | 0;
	return Math.trunc(total / 2) + 0; // + 0 turns -0 into 0
}

/** The exact average, rounded down. `>>> 1` reads the sum as unsigned 32 bits, so it cannot go negative. */
function mid(low: number, high: number): number {
	return (low + high) >>> 1;
}

let items: number[] = []; // the sorted array that `array` loaded

/** Java's contract: the index of key, or -(insertion point) - 1 when it is absent. */
function search(key: number): number {
	let low = 0;
	let high = items.length - 1; // key, if present, lies in items[low..high]
	while (low <= high) {
		const m = (low + high) >>> 1;
		if (items[m] < key) low = m + 1;
		else if (items[m] > key) high = m - 1;
		else return m;
	}
	return -(low + 1);
}

const out: string[] = [];
for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/);
	const arg = (i: number): number => Number(parts[i]);
	switch (parts[0]) {
		case 'naive':
			out.push(String(naiveMid(arg(1), arg(2))));
			break;
		case 'mid':
			out.push(String(mid(arg(1), arg(2))));
			break;
		case 'array':
			items = parts.slice(1).map(Number);
			break;
		case 'search':
			out.push(String(search(arg(1))));
			break;
	}
}
if (out.length > 0) console.log(out.join('\n'));
