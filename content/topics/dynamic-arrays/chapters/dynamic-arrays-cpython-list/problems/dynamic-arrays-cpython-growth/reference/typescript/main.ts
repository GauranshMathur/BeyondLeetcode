import { readFileSync } from 'node:fs';

let block: number[] = []; // a fixed-size block of slots; its size is the capacity
let length = 0; // how many slots are in use
let policy = 'double';
let copies = 0;
const out: string[] = [];

function cpythonCap(size: number): number {
	return (size + (size >> 3) + 6) & ~3;
}

/** The capacity of the block that replaces a full one. */
function nextCap(): number {
	const cap = block.length;
	if (policy === 'exact') return cap + 1;
	if (policy === 'cpython') return cpythonCap(length + 1);
	return cap === 0 ? 1 : cap * 2;
}

/** Replaces the block with one of `cap` slots, copying the items across. */
function moveTo(cap: number): void {
	const newBlock = new Array<number>(cap).fill(0);
	for (let i = 0; i < length; i++) newBlock[i] = block[i];
	copies += length;
	block = newBlock;
}

function append(value: number): void {
	if (length === block.length) moveTo(nextCap());
	block[length] = value;
	length++;
}

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const [command, arg, arg2] = line.trim().split(/\s+/);
	if (command === 'append') {
		append(Number(arg));
	} else if (command === 'get') {
		const i = Number(arg);
		out.push(i >= 0 && i < length ? String(block[i]) : 'error');
	} else if (command === 'len') {
		out.push(String(length));
	} else if (command === 'policy') {
		policy = arg;
	} else if (command === 'cap') {
		out.push(String(block.length));
	} else if (command === 'copies') {
		out.push(String(copies));
	} else if (command === 'fill') {
		for (let n = Number(arg); n > 0; n--) append(Number(arg2));
	}
}
if (out.length > 0) console.log(out.join('\n'));
