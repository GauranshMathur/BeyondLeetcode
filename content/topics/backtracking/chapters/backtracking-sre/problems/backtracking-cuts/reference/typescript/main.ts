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

commands.cuts = (args) => {
	const word = args[0];
	const pieces: string[] = [];
	const go = (start: number) => {
		if (start === word.length) {
			out.push(pieces.join('|'));
			return;
		}
		for (let end = start + 1; end <= word.length; end++) {
			const piece = word.slice(start, end);
			if (piece === [...piece].reverse().join('')) {
				pieces.push(piece); // choose
				go(end); // explore
				pieces.pop(); // undo
			}
		}
	};
	go(0);
};

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
