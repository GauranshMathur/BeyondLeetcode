import { readFileSync } from 'node:fs';

const items: number[] = [];
for (const line of readFileSync(0, 'utf8').split('\n')) {
	const [command, value] = line.trim().split(/\s+/);
	if (command === 'enqueue') {
		items.push(Number(value));
	} else if (command === 'front') {
		console.log(items[0]);
	}
}
