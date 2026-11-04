import { Marked } from 'marked';
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

const plain = new Marked();
const defaultHtml = (md: string) => plain.parse(md, { async: false });

const PRE = '<pre tabindex="0" role="group" aria-label="Code block">';
const BOX = '<div class="scrollbox" tabindex="0" role="group" aria-label="Table">';

describe('renderMarkdown scroll boxes', () => {
	const named: [string, string, string, string][] = [
		['a fence with a language', '```ts\nconst a = 1 < 2;\n```', PRE, '</pre>'],
		['a fence without a language', '```\nplain\n```', PRE, '</pre>'],
		['a table', '| a | b |\n| - | - |\n| 1 | 2 |', `${BOX}<table>`, '</table></div>']
	];
	it.each(named)('%s is named', (_n, md, start, end) => {
		const html = renderMarkdown(md);
		expect(html).toContain(start);
		expect(html).toContain(end);
		expect(html.match(/tabindex/g)).toHaveLength(1);
	});

	it('keeps the code and the cells as Marked renders them', () => {
		expect(renderMarkdown('```ts\nconst a = 1 < 2;\n```')).toBe(
			defaultHtml('```ts\nconst a = 1 < 2;\n```').replace('<pre>', PRE)
		);
		expect(renderMarkdown('| a | b |\n| :- | -: |\n| `x` | **y** |')).toBe(
			`${BOX}${defaultHtml('| a | b |\n| :- | -: |\n| `x` | **y** |').trimEnd()}</div>\n`
		);
	});

	const untouched: [string, string][] = [
		['a paragraph', 'Hello *there* [link](https://example.com).'],
		['a list', '- one\n- two\n  - nested'],
		['inline code', 'Use `x < y` here.']
	];
	it.each(untouched)('%s is Marked default', (_n, md) => {
		expect(renderMarkdown(md)).toBe(defaultHtml(md));
	});
});
