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

commands.weave = (args) => {
	const target = word(args[0]);
	const m = first.length;
	const n = second.length;
	if (target.length !== m + n) {
		out.push('no');
		return;
	}
	// ok[i][j]: the first i + j letters of target are a weave of the first i of first and the first j of second
	const ok = Array.from({ length: m + 1 }, () => new Array<boolean>(n + 1).fill(false));
	ok[0][0] = true;
	for (let i = 0; i <= m; i++) {
		for (let j = 0; j <= n; j++) {
			if (i > 0 && ok[i - 1][j] && first[i - 1] === target[i + j - 1]) ok[i][j] = true;
			if (j > 0 && ok[i][j - 1] && second[j - 1] === target[i + j - 1]) ok[i][j] = true;
		}
	}
	out.push(ok[m][n] ? 'yes' : 'no');
};

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
