import { readFileSync } from 'node:fs';

const frames: number[] = []; // the sizes in bytes of the live frames, oldest first
let used = 0; // bytes in use: the sum of the sizes in frames
const out: string[] = [];

function call(n: number): boolean {
	frames.push(n);
	used += n;
	return true;
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
	}
}
if (out.length > 0) console.log(out.join('\n'));
