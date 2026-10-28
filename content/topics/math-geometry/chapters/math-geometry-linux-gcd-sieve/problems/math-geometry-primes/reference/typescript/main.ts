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
	'spiral'
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

/** The view's items clockwise from the top-left corner, walking in towards the middle. */
function spiral(): number[] {
	const result: number[] = [];
	let top = 0;
	let bottom = rows - 1;
	let left = 0;
	let right = cols - 1;
	while (top <= bottom && left <= right) {
		for (let j = left; j <= right; j++) result.push(at(top, j));
		for (let i = top + 1; i <= bottom; i++) result.push(at(i, right));
		if (top < bottom) for (let j = right - 1; j >= left; j--) result.push(at(bottom, j));
		if (left < right) for (let i = bottom - 1; i > top; i--) result.push(at(i, left));
		top++;
		bottom--;
		left++;
		right--;
	}
	return result;
}

/** How many low bits of x are 0 (x must not be 0). */
function ctz(x: bigint): bigint {
	let n = 0n;
	while ((x & 1n) === 0n) {
		x >>= 1n;
		n++;
	}
	return n;
}

/** Binary GCD, as in Linux's lib/math/gcd.c: shifts and subtractions, no division. */
function gcd(a: bigint, b: bigint): bigint {
	const r = a | b;
	if (a === 0n || b === 0n) return r;
	b >>= ctz(b);
	if (b === 1n) return r & -r;
	for (;;) {
		a >>= ctz(a);
		if (a === 1n) return r & -r;
		if (a === b) return a << ctz(r);
		if (a < b) [a, b] = [b, a];
		a -= b;
	}
}

// The sieve: isPrime[n] for every n below sieveSize, and the largest prime below sieveSize.
let sieveSize = 0;
let isPrime: boolean[] = [];
let lastPrime = 0;

/** Sieve of Eratosthenes over 0 .. size - 1. */
function build(size: number): void {
	isPrime = Array.from({ length: size }, (_, n) => n >= 2);
	for (let p = 2; p < size; p++) {
		if (!isPrime[p]) continue;
		lastPrime = p;
		for (let m = 2 * p; m < size; m += p) isPrime[m] = false;
	}
	sieveSize = size;
}

build(64);

/** The smallest prime above x. A sieve that no longer reaches past x is rebuilt twice as wide. */
function nextPrime(x: number): number {
	while (x >= lastPrime) build(Math.ceil((2 * x) / 64) * 64);
	let n = x + 1;
	while (!isPrime[n]) n++;
	return n;
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
		case 'spiral':
			out.push(spiral().join(' '));
			break;
		case 'gcd':
			out.push(String(gcd(BigInt(parts[1]), BigInt(parts[2]))));
			break;
		case 'nextprime':
			out.push(String(nextPrime(Number(parts[1]))));
			break;
		case 'sieve':
			out.push(`${sieveSize} ${lastPrime}`);
			break;
	}
}
if (out.length > 0) console.log(out.join('\n'));
