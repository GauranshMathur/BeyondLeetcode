import { readFileSync } from 'node:fs';

const out: string[] = [];

const MATRIX_COMMANDS = new Set([
	'at',
	'shape',
	'show',
	'block',
	'transpose',
	'mirror',
	'rotate',
	'spin'
]);

// JavaScript numbers are doubles, but `| 0` and Math.imul give the 32-bit two's-complement result.

/** Grade-school multiplication of two decimal strings, one digit per array slot. */
function bigMul(a: string, b: string): string {
	const x = [...a].reverse().map(Number); // least significant digit first
	const y = [...b].reverse().map(Number);
	const z = new Array<number>(x.length + y.length).fill(0);
	for (let i = 0; i < x.length; i++) {
		let carry = 0;
		for (let j = 0; j < y.length; j++) {
			carry += z[i + j] + y[j] * x[i];
			z[i + j] = carry % 10;
			carry = Math.floor(carry / 10);
		}
		z[i + y.length] += carry;
	}
	while (z.length > 1 && z[z.length - 1] === 0) z.pop();
	return z.reverse().join('');
}

const MASK64 = (1n << 64n) - 1n;

/** base ** exp modulo 2 ** 64, by squaring: one pass per bit of exp. */
function pow64(base: bigint, exp: bigint): bigint {
	let result = 1n;
	while (exp > 0n) {
		if (exp & 1n) result = (result * base) & MASK64;
		exp >>= 1n;
		base = (base * base) & MASK64;
	}
	return result;
}

/** base ** exp modulo mod, by squaring, reducing after every multiplication. */
function powMod(base: bigint, exp: bigint, mod: bigint): bigint {
	let result = 1n % mod;
	base %= mod;
	while (exp > 0n) {
		if (exp & 1n) result = (result * base) % mod;
		exp >>= 1n;
		base = (base * base) % mod;
	}
	return result;
}

// The matrix: one block of items, and a view of it (shape, offset and one stride per axis).
let loaded = false;
let block: number[] = [];
let rows = 0;
let cols = 0;
let offset = 0; // index in the block of the view's item (0, 0)
let rowStride = 0; // how far to move in the block for one step down
let colStride = 0; // ... and for one step right

function load(r: number, c: number, values: number[]): void {
	loaded = true;
	block = values;
	rows = r;
	cols = c;
	offset = 0;
	rowStride = c;
	colStride = 1;
}

function at(i: number, j: number): number {
	return block[offset + i * rowStride + j * colStride];
}

/** Swap the axes of the view. No item moves. */
function transpose(): void {
	[rows, cols] = [cols, rows];
	[rowStride, colStride] = [colStride, rowStride];
}

/** Reverse each row of the view: start at its last column and walk backwards. No item moves. */
function mirror(): void {
	offset += (cols - 1) * colStride;
	colStride = -colStride;
}

function put(i: number, j: number, value: number): void {
	block[offset + i * rowStride + j * colStride] = value;
}

/** Turn a square matrix a quarter clockwise by moving its items inside the block. */
function spin(): boolean {
	const n = rows;
	if (rows !== cols || offset !== 0 || rowStride !== n || colStride !== 1) return false;
	for (let i = 0; i < Math.floor(n / 2); i++) {
		for (let j = i; j < n - 1 - i; j++) {
			const held = at(i, j);
			put(i, j, at(n - 1 - j, i));
			put(n - 1 - j, i, at(n - 1 - i, n - 1 - j));
			put(n - 1 - i, n - 1 - j, at(j, n - 1 - i));
			put(j, n - 1 - i, held);
		}
	}
	return true;
}

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/);
	if (parts[0] === '') continue;
	const command = parts[0];
	if (MATRIX_COMMANDS.has(command) && !loaded) {
		out.push('error');
		continue;
	}
	switch (command) {
		case 'add32':
			out.push(String((Number(parts[1]) + Number(parts[2])) | 0));
			break;
		case 'mul32':
			out.push(String(Math.imul(Number(parts[1]), Number(parts[2]))));
			break;
		case 'mul':
			out.push(bigMul(parts[1], parts[2]));
			break;
		case 'pow64':
			out.push(String(pow64(BigInt(parts[1]), BigInt(parts[2]))));
			break;
		case 'powmod':
			out.push(String(powMod(BigInt(parts[1]), BigInt(parts[2]), BigInt(parts[3]))));
			break;
		case 'matrix': {
			const r = Number(parts[1]);
			const c = Number(parts[2]);
			load(r, c, parts.slice(3, 3 + r * c).map(Number));
			break;
		}
		case 'at': {
			const i = Number(parts[1]);
			const j = Number(parts[2]);
			out.push(i >= 0 && i < rows && j >= 0 && j < cols ? String(at(i, j)) : 'error');
			break;
		}
		case 'shape':
			out.push(`${rows} ${cols}`);
			break;
		case 'show':
			for (let i = 0; i < rows; i++) {
				const row: number[] = [];
				for (let j = 0; j < cols; j++) row.push(at(i, j));
				out.push(row.join(' '));
			}
			break;
		case 'block':
			out.push(block.join(' '));
			break;
		case 'transpose':
			transpose();
			break;
		case 'mirror':
			mirror();
			break;
		case 'rotate':
			// A clockwise quarter turn is a transpose, then a mirror (what NumPy's rot90 composes).
			transpose();
			mirror();
			break;
		case 'spin':
			if (!spin()) out.push('error');
			break;
	}
}
if (out.length > 0) console.log(out.join('\n'));
