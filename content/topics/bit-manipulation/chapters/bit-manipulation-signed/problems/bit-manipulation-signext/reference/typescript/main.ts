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
for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
