import { readFileSync } from 'node:fs';

const out: string[] = [];

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
		case 'mul':
			out.push(bigMul(parts[1], parts[2]));
			break;
	}
}
if (out.length > 0) console.log(out.join('\n'));
