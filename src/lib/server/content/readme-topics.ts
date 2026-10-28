import type { Catalogue } from './catalogue.ts';

export const START_MARKER = '<!-- topics:start -->';
export const END_MARKER = '<!-- topics:end -->';

/** The README's Topics table: one row per Topic in map order, then a totals row. */
export function readmeTopicsTable(catalogue: Catalogue): string {
	const lines = ['| # | Topic | Chapters | Problems |', '|--:|---|--:|--:|'];
	let chapters = 0;
	let core = 0;
	let extra = 0;
	catalogue.topicMap().forEach((summary, index) => {
		const topic = catalogue.topic(summary.id);
		if (!topic) throw new Error(`Topic ${summary.id} is in the map but cannot be loaded`);
		const problems = topic.chapters.flatMap((chapter) => chapter.problems);
		const topicCore = problems.filter((p) => p.kind === 'core').length;
		const topicExtra = problems.length - topicCore;
		chapters += topic.chapters.length;
		core += topicCore;
		extra += topicExtra;
		lines.push(
			`| ${index + 1} | ${summary.title} | ${topic.chapters.length} | ${topicCore} + ${topicExtra} |`
		);
	});
	lines.push(`| | **Total** | **${chapters}** | **${core} + ${extra}** |`);
	return lines.join('\n');
}

/** Returns `text` with what sits between the two topic markers replaced by `body`. Throws if a marker is missing. */
export function replaceBetweenMarkers(text: string, body: string): string {
	const start = text.indexOf(START_MARKER);
	if (start === -1) throw new Error(`Marker ${START_MARKER} not found`);
	const end = text.indexOf(END_MARKER, start);
	if (end === -1) throw new Error(`Marker ${END_MARKER} not found after ${START_MARKER}`);
	return `${text.slice(0, start + START_MARKER.length)}\n${body}\n${text.slice(end)}`;
}
