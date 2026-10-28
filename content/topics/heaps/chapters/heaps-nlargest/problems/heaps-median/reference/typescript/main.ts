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
	compares = 0; // how many times two items have been compared

	/** True when `a` is smaller than `b`: lower key, or the same key and an earlier ticket. */
	less(a: Item, b: Item): boolean {
		this.compares++;
		return a.key < b.key || (a.key === b.key && a.ticket < b.ticket);
	}

	/** Moves the item at `pos` up while it is smaller than its parent, but never above `start`. */
	siftUp(start: number, pos: number): void {
		const items = this.items;
		const item = items[pos];
		while (pos > start) {
			const parent = (pos - 1) >> 1;
			if (!this.less(item, items[parent])) break;
			items[pos] = items[parent];
			pos = parent;
		}
		items[pos] = item;
	}

	/** Opens a hole at `pos`, moves the smaller child up into it again and again until the hole
	 * is at a leaf, puts the item there and sifts it up. */
	siftDown(pos: number): void {
		const items = this.items;
		const end = items.length;
		const start = pos;
		const item = items[pos];
		while (2 * pos + 1 < end) {
			let child = 2 * pos + 1;
			if (child + 1 < end && this.less(items[child + 1], items[child])) child++;
			items[pos] = items[child];
			pos = child;
		}
		items[pos] = item;
		this.siftUp(start, pos);
	}

	push(item: Item): void {
		this.items.push(item);
		this.siftUp(0, this.items.length - 1);
	}

	pop(): Item {
		const last = this.items.pop() as Item;
		if (this.items.length === 0) return last;
		const top = this.items[0];
		this.items[0] = last;
		this.siftDown(0);
		return top;
	}

	/** Overwrites the smallest item with `item` and restores the heap. */
	replaceTop(item: Item): void {
		this.items[0] = item;
		this.siftDown(0);
	}

	/** Replaces the contents with `items` and arranges them into a heap in one pass. */
	init(items: Item[]): void {
		this.items = items;
		for (let pos = (items.length >> 1) - 1; pos >= 0; pos--) this.siftDown(pos);
	}
}

const heap = new Heap();
let tickets = 0; // how many pushes so far
let limit = 0; // 0: keep every item; otherwise the most items to keep
const low = new Heap(); // for `track`: the smaller half of the keys, stored negated so its root is the largest
const high = new Heap(); // for `track`: the larger half
let made = 0; // how many items `track` has made, for their tickets

function trackedItem(key: number): Item {
	return new Item(key, ++made);
}
const out: string[] = [];

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/);
	const command = parts[0];
	if (command === 'push') {
		const item = new Item(Number(parts[1]), tickets++);
		if (limit === 0 || heap.items.length < limit) heap.push(item);
		else if (item.key > heap.items[0].key) heap.replaceTop(item);
	} else if (command === 'keep') {
		limit = Number(parts[1]);
	} else if (command === 'pop') {
		out.push(heap.items.length > 0 ? String((heap.pop() as Item).key) : 'empty');
	} else if (command === 'peek') {
		out.push(heap.items.length > 0 ? String(heap.items[0].key) : 'empty');
	} else if (command === 'size') {
		out.push(String(heap.items.length));
	} else if (command === 'show') {
		out.push(heap.items.length > 0 ? heap.items.map((item) => item.key).join(' ') : 'empty');
	} else if (command === 'cmp') {
		out.push(String(heap.compares));
	} else if (command === 'track') {
		const key = Number(parts[1]);
		if (low.items.length === 0 || key <= -low.items[0].key) low.push(trackedItem(-key));
		else high.push(trackedItem(key));
		if (low.items.length > high.items.length + 1) {
			high.push(trackedItem(-(low.pop() as Item).key));
		} else if (high.items.length > low.items.length) {
			low.push(trackedItem(-(high.pop() as Item).key));
		}
		out.push(String(-low.items[0].key));
	} else if (command === 'init') {
		const keys = parts.slice(1).map(Number);
		heap.init(keys.map((key, i) => new Item(key, tickets + i)));
		tickets += keys.length;
	}
}
if (out.length > 0) console.log(out.join('\n'));
