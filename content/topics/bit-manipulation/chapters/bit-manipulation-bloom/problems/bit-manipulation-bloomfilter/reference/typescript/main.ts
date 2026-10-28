import { readFileSync } from 'node:fs';

let words: number[] = []; // the sequence the commands work on: unsigned 32-bit words
const out: string[] = [];
const commands: Record<string, (args: string[]) => void> = {};

const signed = (w: number): number => w | 0;

commands.load = (args) => {
	words = args.map((x) => Number(x) >>> 0);
};

commands.show = () => {
	out.push(words.map(signed).join(' '));
};

commands.ushow = () => {
	out.push(words.join(' '));
};

commands.signext = (args) => {
	const shift = 32 - Number(args[0]);
	// Move the field's top bit to bit 31, then shift back with the sign copied down.
	out.push(words.map((w) => (w << shift) >> shift).join(' '));
};

commands.wrapsum = () => {
	let total = 0;
	for (const w of words) {
		let a = total;
		let b = w | 0;
		while (b !== 0) {
			// XOR adds without carries; AND, moved one place up, is the carries.
			const carries = (a & b) << 1;
			a ^= b;
			b = carries;
		}
		total = a;
	}
	out.push(String(total | 0));
};

const growTo = (wordIndex: number) => {
	while (words.length <= wordIndex) words.push(0);
};

commands.set = (args) => {
	const i = Number(args[0]);
	growTo(i >> 5);
	words[i >> 5] = (words[i >> 5] | (1 << (i & 31))) >>> 0;
};

commands.clear = (args) => {
	const i = Number(args[0]);
	if (i >> 5 < words.length) words[i >> 5] = (words[i >> 5] & ~(1 << (i & 31))) >>> 0;
};

commands.flip = (args) => {
	const i = Number(args[0]);
	growTo(i >> 5);
	words[i >> 5] = (words[i >> 5] ^ (1 << (i & 31))) >>> 0;
};

commands.test = (args) => {
	const i = Number(args[0]);
	out.push(i >> 5 < words.length ? String((words[i >> 5] >>> (i & 31)) & 1) : '0');
};

const weight32 = (x: number): number => {
	let w = x;
	w -= (w >>> 1) & 0x55555555;
	w = (w & 0x33333333) + ((w >>> 2) & 0x33333333);
	w = (w + (w >>> 4)) & 0x0f0f0f0f;
	return Math.imul(w, 0x01010101) >>> 24;
};

commands.count = (args) => {
	const n = Number(args[0]);
	const full = Math.floor(n / 32);
	const rest = n % 32;
	let total = 0;
	for (let i = 0; i < Math.min(full, words.length); i++) total += weight32(words[i]);
	if (rest > 0 && full < words.length) total += weight32((words[full] & ((1 << rest) - 1)) >>> 0);
	out.push(String(total));
};

commands.recover = () => {
	let parity = 0;
	for (const w of words) parity ^= w;
	out.push(String(parity >>> 0));
};

commands.missing = () => {
	let answer = words.length;
	for (let i = 0; i < words.length; i++) answer ^= i ^ words[i];
	out.push(String(answer >>> 0));
};

commands.lowbit = () => {
	out.push(words.map((w) => (w & -w) >>> 0).join(' '));
};

commands.pow2 = () => {
	out.push(words.map((w) => (w !== 0 && (w & (w - 1)) === 0 ? 'yes' : 'no')).join(' '));
};

commands.countbits = (args) => {
	const n = Number(args[0]);
	const counts = new Array<number>(n + 1).fill(0);
	for (let i = 1; i <= n; i++) counts[i] = counts[i & (i - 1)] + 1; // clear the lowest set bit, add one
	out.push(counts.join(' '));
};

const probes = (bitsPerKey: number): number =>
	Math.min(30, Math.max(1, Math.floor(bitsPerKey * 0.69)));

const filterSize = (n: number, bitsPerKey: number): number =>
	Math.floor((Math.max(64, n * bitsPerKey) + 7) / 8) * 8;

commands.bloomsize = (args) => {
	out.push(`${filterSize(Number(args[0]), Number(args[1]))} ${probes(Number(args[1]))}`);
};

let filterBits = 0; // size of the Bloom filter built last, 0 if none
let filterK = 0; // its number of probes

const keyHash = (x: number): number => {
	const h = (Math.imul(x, 0x9e3779b1) + 0x7f4a7c15) >>> 0;
	return (h ^ (h >>> 16)) >>> 0;
};

// The bit positions a key probes: double hashing, as in LevelDB's filter.
const probePositions = (x: number, bits: number, k: number): number[] => {
	let h = keyHash(x);
	const delta = ((h >>> 17) | (h << 15)) >>> 0; // rotate right 17 bits
	const found: number[] = [];
	for (let j = 0; j < k; j++) {
		found.push(h % bits);
		h = (h + delta) >>> 0;
	}
	return found;
};

commands.bloom = (args) => {
	const keys = args.slice(1).map(Number);
	filterBits = filterSize(keys.length, Number(args[0]));
	filterK = probes(Number(args[0]));
	words = new Array<number>(Math.ceil(filterBits / 32)).fill(0);
	for (const x of keys) {
		for (const pos of probePositions(x, filterBits, filterK)) {
			words[pos >> 5] = (words[pos >> 5] | (1 << (pos & 31))) >>> 0;
		}
	}
};

commands.maybe = (args) => {
	const hit = (pos: number) =>
		pos >> 5 < words.length && ((words[pos >> 5] >>> (pos & 31)) & 1) === 1;
	const all = filterBits > 0 && probePositions(Number(args[0]), filterBits, filterK).every(hit);
	out.push(all ? 'yes' : 'no');
};
for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
