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

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0]))
		commands[parts[0]](parts.slice(1).map(Number));
}
if (lines.length > 0) console.log(lines.join('\n'));
