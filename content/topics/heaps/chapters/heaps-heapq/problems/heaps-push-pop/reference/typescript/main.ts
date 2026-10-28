import { readFileSync } from 'node:fs';

class Item {
	key: number;
	readonly ticket: number;

	constructor(key: number, ticket: number) {
		this.key = key;
		this.ticket = ticket;
	}
}

class Heap {
	items: Item[] = []; // the heap, in array order

	/** True when `a` is smaller than `b`: lower key, or the same key and an earlier ticket. */
	less(a: Item, b: Item): boolean {
		return a.key < b.key || (a.key === b.key && a.ticket < b.ticket);
	}

	/** Moves the item at `pos` up while it is smaller than its parent. */
	siftUp(pos: number): void {
		const items = this.items;
		const item = items[pos];
		while (pos > 0) {
			const parent = (pos - 1) >> 1;
			if (!this.less(item, items[parent])) break;
			items[pos] = items[parent];
			pos = parent;
		}
		items[pos] = item;
	}

	/** Moves the item at `pos` down while a child is smaller than it. */
	siftDown(pos: number): void {
		const items = this.items;
		const end = items.length;
		const item = items[pos];
		while (2 * pos + 1 < end) {
			let child = 2 * pos + 1;
			if (child + 1 < end && this.less(items[child + 1], items[child])) child++;
			if (!this.less(items[child], item)) break;
			items[pos] = items[child];
			pos = child;
		}
		items[pos] = item;
	}

	push(item: Item): void {
		this.items.push(item);
		this.siftUp(this.items.length - 1);
	}

	pop(): Item {
		const last = this.items.pop() as Item;
		if (this.items.length === 0) return last;
		const top = this.items[0];
		this.items[0] = last;
		this.siftDown(0);
		return top;
	}
}

const heap = new Heap();
let tickets = 0; // how many pushes so far
const out: string[] = [];

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/);
	const command = parts[0];
	if (command === 'push') {
		heap.push(new Item(Number(parts[1]), tickets++));
	} else if (command === 'pop') {
		out.push(heap.items.length > 0 ? String((heap.pop() as Item).key) : 'empty');
	} else if (command === 'peek') {
		out.push(heap.items.length > 0 ? String(heap.items[0].key) : 'empty');
	} else if (command === 'size') {
		out.push(String(heap.items.length));
	} else if (command === 'show') {
		out.push(heap.items.length > 0 ? heap.items.map((item) => item.key).join(' ') : 'empty');
	}
}
if (out.length > 0) console.log(out.join('\n'));
