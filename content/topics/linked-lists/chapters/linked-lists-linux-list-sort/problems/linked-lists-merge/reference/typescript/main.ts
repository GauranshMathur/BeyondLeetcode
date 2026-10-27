import { readFileSync } from 'node:fs';

const mem = new Map<number, number>(); // memory: address -> number. A cell nobody wrote reads as 0, which is NULL.
const commands: Record<string, (args: number[]) => void> = {};
const lines: string[] = [];

function rd(addr: number): number {
	return mem.get(addr) ?? 0;
}

function wr(addr: number, value: number): void {
	mem.set(addr, value);
}

function out(...parts: (string | number)[]): void {
	lines.push(parts.join(' '));
}

function outList(items: number[]): void {
	if (items.length > 0) out(...items);
	else out('-');
}

// A list_head is two cells: next at the address, prev at the address + 1.
function initHead(p: number): void {
	wr(p, p);
	wr(p + 1, p);
}

function addBetween(node: number, prev: number, next: number): void {
	wr(next + 1, node);
	wr(node, next);
	wr(node + 1, prev);
	wr(prev, node);
}

commands.init = ([p]) => initHead(p);

commands.add = ([node, head]) => addBetween(node, head, rd(head));

commands.add_tail = ([node, head]) => addBetween(node, rd(head + 1), head);

function forward(head: number): number[] {
	const nodes: number[] = [];
	for (let p = rd(head); p !== head; p = rd(p)) nodes.push(p);
	return nodes;
}

commands.show = ([head]) => outList(forward(head));

commands.empty = ([head]) => out(rd(head) === head ? 'yes' : 'no');

const POISON1 = 256; // LIST_POISON1, 0x100
const POISON2 = 290; // LIST_POISON2, 0x122

function delEntry(e: number): void {
	const prev = rd(e + 1);
	const next = rd(e);
	wr(next + 1, prev);
	wr(prev, next);
}

commands.del = ([e]) => {
	delEntry(e);
	wr(e, POISON1);
	wr(e + 1, POISON2);
};

commands.del_init = ([e]) => {
	delEntry(e);
	initHead(e);
};

commands.show_rev = ([head]) => {
	const nodes: number[] = [];
	for (let p = rd(head + 1); p !== head; p = rd(p + 1)) nodes.push(p);
	outList(nodes);
};

commands.get = ([addr]) => out(rd(addr));

commands.set = ([addr, value]) => wr(addr, value);

commands.entry = ([p, offset]) => out(p - offset);

commands.values = ([head, offset]) => outList(forward(head).map((p) => rd(p - offset)));

const NULL = 0;

// A singly linked list: the head is one cell holding the first node, a node's first cell
// holds the next node, and NULL ends the list.
commands.spush = ([head, node]) => {
	wr(node, rd(head));
	wr(head, node);
};

function singly(head: number): number[] {
	const nodes: number[] = [];
	for (let p = rd(head); p !== NULL; p = rd(p)) nodes.push(p);
	return nodes;
}

commands.sshow = ([head]) => outList(singly(head));

commands.sdel = ([head, node]) => {
	let cur = head; // the cell that holds the pointer to the node being looked at
	let hops = 0;
	for (;;) {
		const next = rd(cur);
		if (next === NULL) {
			out('absent');
			return;
		}
		if (next === node) break;
		cur = next;
		hops++;
	}
	wr(cur, rd(node));
	out(hops);
};

// An hlist: the head is one cell (first). A node is two cells: next, and pprev, the address of
// the cell that points at this node (the head's cell, or the previous node's first cell).
commands.hadd = ([node, head]) => {
	const first = rd(head);
	wr(node, first);
	if (first !== NULL) wr(first + 1, node);
	wr(head, node);
	wr(node + 1, head);
};

commands.hadd_before = ([node, next]) => {
	wr(node + 1, rd(next + 1));
	wr(node, next);
	wr(next + 1, node);
	wr(rd(node + 1), node);
};

commands.hadd_behind = ([node, prev]) => {
	wr(node, rd(prev));
	wr(prev, node);
	wr(node + 1, prev);
	if (rd(node) !== NULL) wr(rd(node) + 1, node);
};

commands.hdel = ([node]) => {
	const next = rd(node);
	const pprev = rd(node + 1);
	wr(pprev, next);
	if (next !== NULL) wr(next + 1, pprev);
	wr(node, POISON1);
	wr(node + 1, POISON2);
};

commands.hshow = commands.sshow;

function splice(list: number, prev: number, next: number): void {
	const first = rd(list);
	const last = rd(list + 1);
	wr(first + 1, prev);
	wr(prev, first);
	wr(last, next);
	wr(next + 1, last);
}

commands.splice = ([list, head]) => {
	if (rd(list) !== list) {
		splice(list, head, rd(head));
		initHead(list);
	}
};

commands.splice_tail = ([list, head]) => {
	if (rd(list) !== list) {
		splice(list, rd(head + 1), head);
		initHead(list);
	}
};

commands.sreverse = ([head]) => {
	let prev = NULL;
	let cur = rd(head);
	while (cur !== NULL) {
		const next = rd(cur);
		wr(cur, prev);
		prev = cur;
		cur = next;
	}
	wr(head, prev);
};

// A singly linked node is two cells: next, then its sort key at the address + 1.
const SCRATCH = -1; // a cell that is never a node, used as the dummy front of a merge

function mergeNodes(a: number, b: number): number {
	let tail = SCRATCH;
	while (a !== NULL && b !== NULL) {
		if (rd(a + 1) <= rd(b + 1)) {
			// on a tie, take a: the merge is stable
			wr(tail, a);
			tail = a;
			a = rd(a);
		} else {
			wr(tail, b);
			tail = b;
			b = rd(b);
		}
	}
	wr(tail, a !== NULL ? a : b);
	return rd(SCRATCH);
}

commands.smerge = ([a, b]) => {
	wr(a, mergeNodes(rd(a), rd(b)));
	wr(b, NULL);
};

commands.svalues = ([head]) => outList(singly(head).map((p) => rd(p + 1)));

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0]))
		commands[parts[0]](parts.slice(1).map(Number));
}
if (lines.length > 0) console.log(lines.join('\n'));
