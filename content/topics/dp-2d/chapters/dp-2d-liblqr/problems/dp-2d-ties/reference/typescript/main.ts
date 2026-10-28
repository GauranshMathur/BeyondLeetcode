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

const MOD = 1_000_000_007;

commands.ties = () => {
	const cost = grid.map((row) => row.slice()); // cost[y][x]: the cheapest seam from the top row down to cell (y, x)
	const count = grid.map((row) => row.map(() => 1)); // count[y][x]: how many different seams have that cost
	for (let y = 1; y < grid.length; y++) {
		for (let x = 0; x < grid[y].length; x++) {
			const near: number[] = [];
			for (let k = Math.max(0, x - 1); k <= Math.min(grid[y].length - 1, x + 1); k++) near.push(k);
			const low = Math.min(...near.map((k) => cost[y - 1][k]));
			cost[y][x] = grid[y][x] + low;
			let total = 0;
			for (const k of near) if (cost[y - 1][k] === low) total = (total + count[y - 1][k]) % MOD;
			count[y][x] = total;
		}
	}
	const last = cost.length - 1;
	const low = Math.min(...cost[last]);
	let total = 0;
	for (let x = 0; x < cost[last].length; x++) if (cost[last][x] === low) total = (total + count[last][x]) % MOD;
	out.push(String(total));
};

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
