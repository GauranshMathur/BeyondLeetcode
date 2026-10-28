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

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
