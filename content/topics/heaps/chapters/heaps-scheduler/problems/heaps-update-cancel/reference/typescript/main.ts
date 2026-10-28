import { readFileSync } from 'node:fs';

class Item {
	key: number;
	readonly ticket: number;
	readonly name: string; // a timer's ID; empty for an item made by push or init
	pos = 0; // the item's index in the heap array, kept up to date by `put`

	constructor(key: number, ticket: number, name = '') {
		this.key = key;
		this.ticket = ticket;
		this.name = name;
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

	/** Every move of an item goes through here, so `item.pos` is always right. */
	put(pos: number, item: Item): void {
		this.items[pos] = item;
		item.pos = pos;
	}

	/** Moves the item at `pos` up while it is smaller than its parent, but never above `start`.
	 * Returns where the item ends up. */
	siftUp(start: number, pos: number): number {
		const items = this.items;
		const item = items[pos];
		while (pos > start) {
			const parent = (pos - 1) >> 1;
			if (!this.less(item, items[parent])) break;
			this.put(pos, items[parent]);
			pos = parent;
		}
		this.put(pos, item);
		return pos;
	}

	/** Opens a hole at `pos`, moves the smaller child up into it again and again until the hole
	 * is at a leaf, puts the item there and sifts it up. Returns where the item ends up. */
	siftDown(pos: number): number {
		const items = this.items;
		const end = items.length;
		const start = pos;
		const item = items[pos];
		while (2 * pos + 1 < end) {
			let child = 2 * pos + 1;
			if (child + 1 < end && this.less(items[child + 1], items[child])) child++;
			this.put(pos, items[child]);
			pos = child;
		}
		this.put(pos, item);
		return this.siftUp(start, pos);
	}

	/** Restores the heap after the item at `pos` changed its key or took the place of another. */
	fix(pos: number): void {
		if (this.siftDown(pos) === pos) this.siftUp(0, pos);
	}

	push(item: Item): void {
		this.items.push(item);
		this.siftUp(0, this.items.length - 1);
	}

	pop(): Item {
		return this.remove(0);
	}

	/** Takes out the item at `pos`: the last item fills the gap and is fixed. */
	remove(pos: number): Item {
		const removed = this.items[pos];
		const last = this.items.pop() as Item;
		if (pos < this.items.length) {
			this.put(pos, last);
			this.fix(pos);
		}
		return removed;
	}

	/** Overwrites the smallest item with `item` and restores the heap. */
	replaceTop(item: Item): void {
		this.put(0, item);
		this.siftDown(0);
	}

	/** Replaces the contents with `items` and arranges them into a heap in one pass. */
	init(items: Item[]): void {
		this.items = items;
		items.forEach((item, pos) => {
			item.pos = pos;
		});
		for (let pos = (items.length >> 1) - 1; pos >= 0; pos--) this.siftDown(pos);
	}
}

const heap = new Heap();
let tickets = 0; // how many pushes so far
let limit = 0; // 0: keep every item; otherwise the most items to keep
let queued = new Map<string, Item>(); // ID -> the timer with that ID that is in the heap

function popItem(): Item {
	const item = heap.pop();
	if (queued.get(item.name) === item) queued.delete(item.name);
	return item;
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
		out.push(heap.items.length > 0 ? String(popItem().key) : 'empty');
	} else if (command === 'peek') {
		out.push(heap.items.length > 0 ? String(heap.items[0].key) : 'empty');
	} else if (command === 'size') {
		out.push(String(heap.items.length));
	} else if (command === 'show') {
		out.push(heap.items.length > 0 ? heap.items.map((item) => item.key).join(' ') : 'empty');
	} else if (command === 'cmp') {
		out.push(String(heap.compares));
	} else if (command === 'sched') {
		const item = new Item(Number(parts[2]), tickets++, parts[1]);
		queued.set(item.name, item);
		heap.push(item);
	} else if (command === 'advance') {
		const now = Number(parts[1]);
		while (heap.items.length > 0 && heap.items[0].key <= now) {
			const item = popItem();
			out.push(item.name);
		}
	} else if (command === 'update' || command === 'cancel') {
		const item = queued.get(parts[1]);
		if (item === undefined) {
			out.push('error');
		} else if (command === 'update') {
			item.key = Number(parts[2]);
			heap.fix(item.pos);
		} else {
			queued.delete(item.name);
			heap.remove(item.pos);
		}
	} else if (command === 'init') {
		const keys = parts.slice(1).map(Number);
		heap.init(keys.map((key, i) => new Item(key, tickets + i)));
		tickets += keys.length;
		queued = new Map();
	}
}
if (out.length > 0) console.log(out.join('\n'));
