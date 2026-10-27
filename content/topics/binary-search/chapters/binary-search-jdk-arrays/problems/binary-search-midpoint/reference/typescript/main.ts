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
}
if (out.length > 0) console.log(out.join('\n'));
