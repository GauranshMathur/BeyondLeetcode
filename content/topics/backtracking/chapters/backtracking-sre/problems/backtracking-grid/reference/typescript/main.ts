import { readFileSync } from 'node:fs';

const out: string[] = [];
const commands: Record<string, (args: string[]) => void> = {};

interface Step {
	group: boolean;
	options: string[];
}

/** Splits a pattern into steps: whether it is a group, and the strings the step can match. */
function parse(pattern: string): Step[] {
	const steps: Step[] = [];
	let i = 0;
	while (i < pattern.length) {
		if (pattern[i] === '(') {
			const j = pattern.indexOf(')', i);
			steps.push({ group: true, options: pattern.slice(i + 1, j).split('|') });
			i = j + 1;
		} else {
			let j = i;
			while (j < pattern.length && pattern[j] !== '(') j++;
			steps.push({ group: false, options: [pattern.slice(i, j)] });
			i = j;
		}
	}
	return steps;
}

commands.match = (args) => {
	const steps = parse(args[0]);
	const text = args[1];
	const chosen: number[] = []; // the alternative picked at each group so far
	const go = (step: number, pos: number): boolean => {
		if (step === steps.length) return pos === text.length;
		const { group, options } = steps[step];
		for (let index = 0; index < options.length; index++) {
			const option = options[index];
			if (!text.startsWith(option, pos)) continue;
			if (group) chosen.push(index); // choose
			if (go(step + 1, pos + option.length)) return true; // explore
			if (group) chosen.pop(); // undo
		}
		return false;
	};
	out.push(go(0, 0) ? ['yes', ...chosen].join(' ') : 'no');
};

commands.find = (args) => {
	const word = args[0];
	const rows = args.slice(1);
	const used = rows.map((row) => new Array<boolean>(row.length).fill(false));
	const path: string[] = [];
	const moves = [
		[-1, 0],
		[0, 1],
		[1, 0],
		[0, -1]
	]; // up, right, down, left
	const walk = (r: number, c: number, k: number): boolean => {
		if (used[r][c] || rows[r][c] !== word[k]) return false;
		used[r][c] = true; // choose
		path.push(`${r}:${c}`);
		if (k === word.length - 1) return true;
		for (const [dr, dc] of moves) {
			const nr = r + dr;
			const nc = c + dc;
			if (nr >= 0 && nr < rows.length && nc >= 0 && nc < rows[nr].length && walk(nr, nc, k + 1)) {
				return true; // explore
			}
		}
		path.pop(); // undo
		used[r][c] = false;
		return false;
	};
	for (let r = 0; r < rows.length; r++) {
		for (let c = 0; c < rows[r].length; c++) {
			if (walk(r, c, 0)) {
				out.push(['yes', ...path].join(' '));
				return;
			}
		}
	}
	out.push('no');
};

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
