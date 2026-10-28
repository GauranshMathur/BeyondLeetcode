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

/** How many states the search enters, where a state is (step, position). */
function calls(steps: Step[], text: string, prune: boolean): number {
	const seen = new Set<number>();
	let count = 0;
	const go = (step: number, pos: number): boolean => {
		if (prune) {
			const key = step * (text.length + 1) + pos;
			if (seen.has(key)) return false; // entered before, and the search is still going: it failed
			seen.add(key);
		}
		count++;
		if (step === steps.length) return pos === text.length;
		for (const option of steps[step].options) {
			if (text.startsWith(option, pos) && go(step + 1, pos + option.length)) return true;
		}
		return false;
	};
	go(0, 0);
	return count;
}

commands.cost = (args) => {
	const steps = parse(args[0]);
	const text = args[1];
	out.push(`plain ${calls(steps, text, false)} visited ${calls(steps, text, true)}`);
};

const available = new Map<string, number[]>(); // package -> its versions
const requires = new Map<string, [string, number, number][]>(); // "package version" -> its ranges
const needs: [string, number, number][] = []; // (package, lowest, highest) asked for by the root

commands.pkg = (args) => {
	available.set(args[0], args.slice(1).map(Number));
};

commands.dep = (args) => {
	const key = `${args[0]} ${Number(args[1])}`;
	const list = requires.get(key) ?? [];
	list.push([args[2], Number(args[3]), Number(args[4])]);
	requires.set(key, list);
};

commands.need = (args) => {
	needs.push([args[0], Number(args[1]), Number(args[2])]);
};

commands.resolve = () => {
	const pins = new Map<string, number>(); // package -> the version chosen for it
	const wanted = [...needs]; // a stack of (package, lowest, highest) ranges
	const go = (): boolean => {
		const todo = [...new Set(wanted.map(([p]) => p).filter((p) => !pins.has(p)))].sort();
		if (todo.length === 0) return true;
		const name = todo[0];
		const versions = [...(available.get(name) ?? [])].sort((a, b) => b - a);
		for (const version of versions) {
			if (!wanted.every(([p, lo, hi]) => p !== name || (lo <= version && version <= hi))) continue;
			const added = requires.get(`${name} ${version}`) ?? [];
			const pinned = (p: string) => pins.get(p) as number;
			if (added.some(([p, lo, hi]) => pins.has(p) && !(lo <= pinned(p) && pinned(p) <= hi)))
				continue;
			pins.set(name, version); // choose
			wanted.push(...added);
			if (go()) return true; // explore
			wanted.length -= added.length; // undo
			pins.delete(name);
		}
		return false;
	};
	if (go()) {
		const names = [...pins.keys()].sort();
		out.push(['ok', ...names.map((n) => `${n}=${pins.get(n)}`)].join(' '));
	} else {
		out.push('conflict');
	}
};

let values: number[] = []; // the list the commands work on

commands.load = (args) => {
	values = args.map(Number);
};

function fmt(items: number[]): string {
	return `[${items.join(' ')}]`;
}

commands.subsets = () => {
	const current: number[] = [];
	const grow = (start: number) => {
		out.push(fmt(current));
		for (let i = start; i < values.length; i++) {
			current.push(values[i]); // choose
			grow(i + 1); // explore
			current.pop(); // undo
		}
	};
	grow(0);
};

commands.perms = (args) => {
	const n = values.length;
	const size = args.length > 0 ? Number(args[0]) : n;
	const used: boolean[] = new Array(n).fill(false);
	const current: number[] = [];
	const fill = () => {
		if (current.length === size) {
			out.push(fmt(current));
			return;
		}
		for (let i = 0; i < n; i++) {
			if (used[i]) continue;
			used[i] = true; // choose
			current.push(values[i]);
			fill(); // explore
			current.pop(); // undo
			used[i] = false;
		}
	};
	fill();
};

commands.queens = (args) => {
	const n = Number(args[0]);
	const cols: boolean[] = new Array(n).fill(false); // is this column taken
	const diag: boolean[] = new Array(2 * n - 1).fill(false); // is this "\" diagonal taken (row + col)
	const anti: boolean[] = new Array(2 * n - 1).fill(false); // is this "/" diagonal taken (row - col, shifted)
	const placed: number[] = []; // the column (from 1) of the queen in each row so far
	let count = 0;
	let first: number[] | null = null;
	const place = (row: number) => {
		if (row === n) {
			count++;
			if (first === null) first = [...placed];
			return;
		}
		for (let c = 0; c < n; c++) {
			if (cols[c] || diag[row + c] || anti[row - c + n - 1]) continue;
			cols[c] = diag[row + c] = anti[row - c + n - 1] = true; // choose
			placed.push(c + 1);
			place(row + 1); // explore
			placed.pop(); // undo
			cols[c] = diag[row + c] = anti[row - c + n - 1] = false;
		}
	};
	place(0);
	out.push(String(count));
	if (first !== null) out.push((first as number[]).join(' '));
};

for (const line of readFileSync(0, 'utf8').split('\n')) {
	const parts = line.trim().split(/\s+/).filter(Boolean);
	if (parts.length > 0 && Object.hasOwn(commands, parts[0])) commands[parts[0]](parts.slice(1));
}
if (out.length > 0) console.log(out.join('\n'));
