import { readFileSync } from 'node:fs';

const frames: number[] = []; // the sizes in bytes of the live frames, oldest first
let used = 0; // bytes in use: the sum of the sizes in frames
let segment = 2048; // bytes the stack owns
let moved = 0; // bytes copied each time the stack moves to a new segment
let maxStack = 1000000000; // the largest segment allowed
let data: number[] = new Array<number>(10).fill(0); // the slots behind the value stack
let count = 0; // how many slots hold an item
let copies = 0; // items copied when the value stack grew
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

function push(x: number): void {
	if (count === data.length) {
		const bigger = new Array<number>(data.length * 2).fill(0);
		for (let i = 0; i < count; i++) bigger[i] = data[i];
		copies += count;
		data = bigger;
	}
	data[count] = x;
	count++;
}

function pop(): string {
	if (count === 0) return 'error';
	count--;
	const item = data[count];
	data[count] = 0;
	return String(item);
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
	} else if (command === 'push') {
		push(Number(args[0]));
	} else if (command === 'pop') {
		out.push(pop());
	} else if (command === 'peek') {
		out.push(count > 0 ? String(data[count - 1]) : 'error');
	} else if (command === 'empty') {
		out.push(count === 0 ? 'true' : 'false');
	} else if (command === 'search') {
		let found = -1;
		for (let i = count - 1; i >= 0; i--) {
			if (data[i] === Number(args[0])) {
				found = count - i;
				break;
			}
		}
		out.push(String(found));
	} else if (command === 'size') {
		out.push(String(count));
	} else if (command === 'capacity') {
		out.push(String(data.length));
	} else if (command === 'copies') {
		out.push(String(copies));
	}
}
if (out.length > 0) console.log(out.join('\n'));
