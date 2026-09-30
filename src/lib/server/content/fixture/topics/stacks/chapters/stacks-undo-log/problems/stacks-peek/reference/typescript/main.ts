import { readFileSync } from 'node:fs';

const items: number[] = [];
for (const line of readFileSync(0, 'utf8').split('\n')) {
	const [command, value] = line.trim().split(/\s+/);
	if (command === 'push') {
		items.push(Number(value));
	} else if (command === 'size') {
		console.log(items.length);
	} else if (command === 'peek') {
		console.log(items[items.length - 1]);
	}
}
