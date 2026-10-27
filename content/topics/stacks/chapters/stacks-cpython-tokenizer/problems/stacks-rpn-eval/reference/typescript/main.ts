import { readFileSync } from 'node:fs';

const frames: number[] = []; // the sizes in bytes of the live frames, oldest first
let used = 0; // bytes in use: the sum of the sizes in frames
let segment = 2048; // bytes the stack owns
let moved = 0; // bytes copied each time the stack moves to a new segment
let maxStack = 1000000000; // the largest segment allowed
let data: number[] = new Array<number>(10).fill(0); // the slots behind the value stack
let count = 0; // how many slots hold an item
let copies = 0; // items copied when the value stack grew
const mins: number[] = []; // mins[i] is the smallest of the first i + 1 items
let listLen = 0; // the number of elements being sorted
let runEnd = 0; // where the runs seen so far end
let pending: { length: number; power: number }[] = []; // each run not yet merged, oldest first
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
	mins.push(mins.length > 0 ? Math.min(x, mins[mins.length - 1]) : x);
}

function pop(): string {
	if (count === 0) return 'error';
	count--;
	const item = data[count];
	data[count] = 0;
	mins.pop();
	return String(item);
}

function power(s1: number, n1: number, n2: number, n: number): number {
	let result = 0;
	let a = 2 * s1 + n1;
	let b = a + n1 + n2;
	for (;;) {
		result++;
		if (a >= n) {
			a -= n;
			b -= n;
		} else if (b >= n) {
			break;
		}
		a *= 2;
		b *= 2;
	}
	return result;
}

function mergeAt(i: number): void {
	out.push(`merge ${pending[i].length} ${pending[i + 1].length}`);
	pending[i].length += pending[i + 1].length;
	pending.splice(i + 1, 1);
}

function addRun(length: number): void {
	if (pending.length > 0) {
		const n1 = pending[pending.length - 1].length;
		const p = power(runEnd - n1, n1, length, listLen);
		while (pending.length > 1 && pending[pending.length - 2].power > p) {
			mergeAt(pending.length - 2);
		}
		pending[pending.length - 1].power = p;
	}
	pending.push({ length, power: 0 });
	runEnd += length;
}

function finish(): void {
	while (pending.length > 1) {
		let i = pending.length - 2;
		if (i > 0 && pending[i - 1].length < pending[i + 1].length) i--;
		mergeAt(i);
	}
}

function nextLonger(values: number[]): number[] {
	const answer = new Array<number>(values.length).fill(0);
	const stack: number[] = []; // indexes whose answer is still unknown; their values never rise
	for (let i = 0; i < values.length; i++) {
		while (stack.length > 0 && values[stack[stack.length - 1]] < values[i]) {
			const j = stack.pop() as number;
			answer[j] = i - j;
		}
		stack.push(i);
	}
	return answer;
}

function scan(source: string): string {
	const stack: { bracket: string; line: number }[] = []; // each opening bracket not yet closed
	let line = 1;
	for (const c of source) {
		if (c === '/') {
			line++;
		} else if ('([{'.includes(c)) {
			if (stack.length >= 200) return 'too many nested parentheses';
			stack.push({ bracket: c, line });
		} else {
			const top = stack.pop();
			if (top === undefined) return `unmatched '${c}'`;
			if ('([{'.indexOf(top.bracket) !== ')]}'.indexOf(c)) {
				let message = `closing parenthesis '${c}' does not match opening parenthesis '${top.bracket}'`;
				if (top.line !== line) message += ` on line ${top.line}`;
				return message;
			}
		}
	}
	if (stack.length > 0) return `'${stack[stack.length - 1].bracket}' was never closed`;
	return 'ok';
}

function evaluate(tokens: string[]): string {
	const stack: number[] = [];
	let deepest = 0;
	for (const token of tokens) {
		if (token === '+' || token === '-' || token === '*' || token === '//') {
			if (stack.length < 2) return 'error stack underflow';
			const rhs = stack.pop() as number;
			const lhs = stack.pop() as number;
			if (token === '+') stack.push(lhs + rhs);
			else if (token === '-') stack.push(lhs - rhs);
			else if (token === '*') stack.push(lhs * rhs);
			else {
				if (rhs === 0) return 'error divide by zero';
				stack.push(Math.floor(lhs / rhs));
			}
		} else {
			stack.push(Number(token));
			deepest = Math.max(deepest, stack.length);
		}
	}
	if (stack.length !== 1) return 'error not one value';
	return `${stack[0]} ${deepest}`;
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
	} else if (command === 'min') {
		out.push(mins.length > 0 ? String(mins[mins.length - 1]) : 'error');
	} else if (command === 'sort') {
		listLen = Number(args[0]);
		runEnd = 0;
		pending = [];
	} else if (command === 'run') {
		addRun(Number(args[0]));
	} else if (command === 'end') {
		finish();
	} else if (command === 'pending') {
		out.push(pending.length > 0 ? pending.map((run) => run.length).join(' ') : 'empty');
	} else if (command === 'nextlonger') {
		out.push(nextLonger(args.map(Number)).join(' '));
	} else if (command === 'scan') {
		out.push(scan(args[0] ?? ''));
	} else if (command === 'rpn') {
		out.push(evaluate(args));
	}
}
if (out.length > 0) console.log(out.join('\n'));
