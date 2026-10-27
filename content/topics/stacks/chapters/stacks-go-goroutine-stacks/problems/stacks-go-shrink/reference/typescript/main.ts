import { readFileSync } from 'node:fs';

const frames: number[] = []; // the sizes in bytes of the live frames, oldest first
let used = 0; // bytes in use: the sum of the sizes in frames
let segment = 2048; // bytes the stack owns
let moved = 0; // bytes copied each time the stack moves to a new segment
let maxStack = 1000000000; // the largest segment allowed
const out: string[] = [];

function moveTo(size: number): void {
	moved += used;
	segment = size;
}

function call(n: number): boolean {
	if (used + n > segment) {
		let newSize = segment * 2;
		while (newSize < used + n) newSize *= 2;
		if (newSize > maxStack) {
			out.push('stack overflow');
			return false;
		}
		moveTo(newSize);
	}
	frames.push(n);
	used += n;
	return true;
}

function collect(): void {
	const half = Math.floor(segment / 2);
	if (half >= 2048 && used < Math.floor(segment / 4)) moveTo(half);
}

run: for (const text of readFileSync(0, 'utf8').split('\n')) {
	const parts = text.trim().split(/\s+/);
	const command = parts[0];
	const args = parts.slice(1);
	if (command === '') continue;
	if (command === 'call') {
		if (!call(Number(args[0]))) break run;
	} else if (command === 'ret') {
		const size = frames.pop();
		if (size === undefined) {
			out.push('error');
		} else {
			used -= size;
			out.push(String(size));
		}
	} else if (command === 'depth') {
		out.push(String(frames.length));
	} else if (command === 'used') {
		out.push(String(used));
	} else if (command === 'segment') {
		out.push(String(segment));
	} else if (command === 'moved') {
		out.push(String(moved));
	} else if (command === 'limit') {
		maxStack = Number(args[0]);
	} else if (command === 'gc') {
		collect();
	}
}
if (out.length > 0) console.log(out.join('\n'));
