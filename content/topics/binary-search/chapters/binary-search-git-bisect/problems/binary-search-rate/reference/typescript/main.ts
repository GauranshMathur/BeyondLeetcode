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

/** First index whose item is >= key (items.length if none). The answer lies in [low, high]. */
function lower(key: number): number {
	let low = 0;
	let high = items.length;
	while (low < high) {
		const m = (low + high) >>> 1;
		if (items[m] < key) low = m + 1;
		else high = m;
	}
	return low;
}

/** First index whose item is > key (items.length if none). */
function upper(key: number): number {
	let low = 0;
	let high = items.length;
	while (low < high) {
		const m = (low + high) >>> 1;
		if (items[m] <= key) low = m + 1;
		else high = m;
	}
	return low;
}

/** Commits 1..commits; commit `commits` is known bad. Returns the first bad commit and the tests run. */
function bisect(commits: number, firstBad: number): [number, number] {
	let low = 1;
	let high = commits; // the first bad commit lies in [low, high]
	let tests = 0;
	while (low < high) {
		const m = (low + high) >>> 1;
		tests++;
		if (m >= firstBad) high = m; // the test of commit m says "bad"
		else low = m + 1;
	}
	return [low, tests];
}

function hoursNeeded(rate: number): number {
	let hours = 0;
	for (const pile of items) hours += Math.ceil(pile / rate);
	return hours;
}

/** Smallest rate in [1, max(items)] with hoursNeeded(rate) <= hours. */
function slowestRate(hours: number): number {
	let low = 1;
	let high = Math.max(...items);
	while (low < high) {
		const m = (low + high) >>> 1;
		if (hoursNeeded(m) <= hours) high = m;
		else low = m + 1;
	}
	return low;
}

const out: string[] = [];
for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/);
	const command = parts[0];
	if (command === '') continue;
	if (false) {
		// keeps the chain below uniform
	}
	else if (command === 'naive') out.push(String(naiveMid(Number(parts[1]), Number(parts[2]))));
	else if (command === 'mid') out.push(String(mid(Number(parts[1]), Number(parts[2]))));
	else if (command === 'array') items = parts.slice(1).map(Number);
	else if (command === 'search') out.push(String(search(Number(parts[1]))));
	else if (command === 'lower') out.push(String(lower(Number(parts[1]))));
	else if (command === 'upper') out.push(String(upper(Number(parts[1]))));
	else if (command === 'count') out.push(String(upper(Number(parts[1])) - lower(Number(parts[1]))));
	else if (command === 'bisect') {
		const [found, tests] = bisect(Number(parts[1]), Number(parts[2]));
		out.push(`${found} ${tests}`);
	}
	else if (command === 'rate') out.push(String(slowestRate(Number(parts[1]))));
}
if (out.length > 0) console.log(out.join('\n'));
