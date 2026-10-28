import { readFileSync } from 'node:fs';

const out: string[] = [];

// JavaScript numbers are doubles, but `| 0` and Math.imul give the 32-bit two's-complement result.

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/);
	if (parts[0] === '') continue;
	const command = parts[0];
	switch (command) {
		case 'add32':
			out.push(String((Number(parts[1]) + Number(parts[2])) | 0));
			break;
		case 'mul32':
			out.push(String(Math.imul(Number(parts[1]), Number(parts[2]))));
			break;
	}
}
if (out.length > 0) console.log(out.join('\n'));
