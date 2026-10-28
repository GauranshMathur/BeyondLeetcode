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
	const c = Array.from({ length: first.length + 1 }, () =>
		new Array<number>(second.length + 1).fill(0)
	);
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

const MOD = 1_000_000_007;

commands.ways = (args) => {
	const amount = Number(args[0]);
	const coins = items.map((item) => item.weight).filter((weight) => weight > 0);
	// table[i][j]: the ways to pay j using only the first i coins, each as often as you like
	const table = Array.from({ length: coins.length + 1 }, () =>
		new Array<number>(amount + 1).fill(0)
	);
	table[0][0] = 1;
	for (let i = 1; i <= coins.length; i++) {
		const coin = coins[i - 1];
		for (let j = 0; j <= amount; j++) {
			table[i][j] = table[i - 1][j]; // without coin i
			if (coin <= j) table[i][j] = (table[i][j] + table[i][j - coin]) % MOD; // one more of coin i
		}
	}
	out.push(String(table[coins.length][amount]));
};

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
