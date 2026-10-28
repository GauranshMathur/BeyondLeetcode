import { readFileSync } from 'node:fs';

const out: string[] = [];
const commands: Record<string, (args: string[]) => void> = {};

let first = '';
let second = ''; // the two words the commands work on

const word = (text: string) => (text === '-' ? '' : text); // an empty word is written -
const showWord = (text: string) => (text === '' ? '-' : text);

commands.words = (args) => {
	first = word(args[0]);
	second = word(args[1]);
};

commands.show = () => {
	out.push(`${showWord(first)} ${showWord(second)}`);
};

function lcsTable(): number[][] {
	// c[i][j]: length of the longest common subsequence of the first i letters of first and the first j of second
	const c = Array.from({ length: first.length + 1 }, () => new Array<number>(second.length + 1).fill(0));
	for (let i = 1; i <= first.length; i++) {
		for (let j = 1; j <= second.length; j++) {
			c[i][j] =
				first[i - 1] === second[j - 1] ? c[i - 1][j - 1] + 1 : Math.max(c[i - 1][j], c[i][j - 1]);
		}
	}
	return c;
}

commands.common = () => {
	out.push(String(lcsTable()[first.length][second.length]));
};

commands.trace = () => {
	const c = lcsTable();
	let i = first.length;
	let j = second.length;
	const picked: string[] = []; // the common letters, last one first
	while (i > 0 && j > 0) {
		if (first[i - 1] === second[j - 1]) {
			picked.push(first[i - 1]);
			i--;
			j--;
		} else if (c[i - 1][j] >= c[i][j - 1]) {
			i--;
		} else {
			j--;
		}
	}
	out.push(showWord(picked.reverse().join('')));
};

let grid: number[][] = []; // the energy grid, one array per row

commands.grid = (args) => {
	const rows = Number(args[0]);
	const cols = Number(args[1]);
	const cells = args.slice(2).map(Number);
	grid = Array.from({ length: rows }, (_, r) => cells.slice(r * cols, (r + 1) * cols));
};

commands.seam = () => {
	const m = [grid[0].slice()]; // m[y][x]: the cheapest seam from the top row down to cell (y, x)
	for (let y = 1; y < grid.length; y++) {
		m.push(
			grid[y].map((energy, x) => energy + Math.min(...m[y - 1].slice(Math.max(0, x - 1), x + 2)))
		);
	}
	out.push(String(Math.min(...m[m.length - 1])));
};

let items: { weight: number; value: number }[] = []; // the weight and value of each item

commands.items = (args) => {
	items = [];
	for (let k = 0; k + 1 < args.length; k += 2) {
		items.push({ weight: Number(args[k]), value: Number(args[k + 1]) });
	}
};

commands.keep = (args) => {
	const cap = Number(args[0]);
	// table[i][j]: the most value from the first i items within weight j
	const table = Array.from({ length: items.length + 1 }, () => new Array<number>(cap + 1).fill(0));
	for (let i = 1; i <= items.length; i++) {
		const { weight, value } = items[i - 1];
		for (let j = 0; j <= cap; j++) {
			table[i][j] = table[i - 1][j]; // leave item i
			if (weight <= j) table[i][j] = Math.max(table[i][j], table[i - 1][j - weight] + value); // take it once
		}
	}
	out.push(String(table[items.length][cap]));
};

commands.edit = (args) => {
	const [ins, del, sub] = args.map(Number);
	const m = first.length;
	let prev = Array.from({ length: m + 1 }, (_, i) => i * del); // the row for the first j - 1 letters of second
	let curr = new Array<number>(m + 1).fill(0); // the row being filled, for the first j
	for (let j = 1; j <= second.length; j++) {
		curr[0] = j * ins;
		for (let i = 1; i <= m; i++) {
			const same = prev[i - 1] + (first[i - 1] === second[j - 1] ? 0 : sub);
			curr[i] = Math.min(same, prev[i] + ins, curr[i - 1] + del);
		}
		[prev, curr] = [curr, prev];
	}
	out.push(String(prev[m]));
};

commands.within = (args) => {
	const [ins, del, sub, limit] = args.map(Number);
	const m = first.length;
	let prev = Array.from({ length: m + 1 }, (_, i) => i * del);
	let curr = new Array<number>(m + 1).fill(0);
	for (let j = 1; j <= second.length; j++) {
		curr[0] = j * ins;
		for (let i = 1; i <= m; i++) {
			const same = prev[i - 1] + (first[i - 1] === second[j - 1] ? 0 : sub);
			curr[i] = Math.min(same, prev[i] + ins, curr[i - 1] + del);
		}
		[prev, curr] = [curr, prev];
		if (Math.min(...prev) > limit) break; // every later row is at least this much, so the answer is over
	}
	out.push(prev[m] <= limit ? String(prev[m]) : 'over');
};

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
