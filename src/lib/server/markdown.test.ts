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

describe('renderMarkdown raw HTML and link targets', () => {
	const escaped: [string, string, string][] = [
		[
			'angle words in a sentence',
			'a <prev> -> <next> edge',
			'<p>a &lt;prev&gt; -&gt; &lt;next&gt; edge</p>'
		],
		[
			'a generic type in prose',
			'class C implements Comparable<C> here',
			'<p>class C implements Comparable&lt;C&gt; here</p>'
		],
		['an unknown tag', '<x>', '&lt;x&gt;'],
		[
			'an image with a handler',
			'<img src=x onerror=alert(1)>',
			'&lt;img src=x onerror=alert(1)&gt;'
		],
		[
			'an inline script',
			'a <script>alert(1)</script> b',
			'a &lt;script&gt;alert(1)&lt;/script&gt; b'
		],
		[
			'a block of HTML',
			'<div onclick="x()">hi</div>',
			'&lt;div onclick=&quot;x()&quot;&gt;hi&lt;/div&gt;'
		],
		['a comment', 'a <!-- hidden --> b', 'a &lt;!-- hidden --&gt; b']
	];
	it.each(escaped)('%s is shown as text', (_n, md, expected) => {
		const html = renderMarkdown(md);
		expect(html).toContain(expected);
		expect(html).not.toMatch(/<(img|script|div|x|prev|next)[\s>]/i);
	});

	it('keeps text typed after an open raw tag escaped', () => {
		const html = renderMarkdown('<pre>a <img src=x onerror=alert(1) b');
		expect(html).not.toMatch(/<img/i);
		expect(html).not.toMatch(/<pre/i);
	});

	it('leaves code spans and fences as marked renders them', () => {
		expect(renderMarkdown('Use `<div>` here.')).toBe(defaultHtml('Use `<div>` here.'));
		expect(renderMarkdown('```html\n<b>x</b>\n```')).toContain('&lt;b&gt;x&lt;/b&gt;');
	});

	const kept: [string, string][] = [
		['an https link', '[a](https://example.com/x?y=1)'],
		['an http link', '[a](http://example.com)'],
		['a relative path', '[a](/chapters/trees-traversal)'],
		['a relative file', '[a](../x.md)'],
		['an anchor', '[a](#top)'],
		['an https image', '![alt](https://example.com/i.png)'],
		['a link with a title', '[a](https://example.com "t")']
	];
	it.each(kept)('%s is Marked default', (_n, md) => {
		expect(renderMarkdown(md)).toBe(defaultHtml(md));
	});

	const dropped: [string, string, string][] = [
		['a javascript link', '[click](javascript:alert(1))', '<p>click</p>'],
		['a mixed-case scheme', '[click](JaVaScRiPt:alert(1))', '<p>click</p>'],
		['a scheme with a tab', '[click](<java\tscript:alert(1)>)', '<p>click</p>'],
		['a data link', '[click](data:text/html;base64,PHNjcmlwdD4=)', '<p>click</p>'],
		['a vbscript link', '[click](vbscript:x)', '<p>click</p>'],
		['a file link', '[click](file:///etc/passwd)', '<p>click</p>'],
		['an autolink', '<javascript:alert(1)>', '<p>javascript:alert(1)</p>'],
		['a reference link', '[click][r]\n\n[r]: javascript:alert(1)', '<p>click</p>'],
		['a javascript image', '![alt text](javascript:alert(1))', '<p>alt text</p>']
	];
	it.each(dropped)('%s keeps its words and loses its target', (_n, md, expected) => {
		const html = renderMarkdown(md);
		expect(html.trim()).toBe(expected);
		expect(html).not.toMatch(/href|src=/i);
	});
});

describe('renderMarkdown text after an open raw tag', () => {
	const cases: [string, string, string][] = [
		['an open pre tag', 'a <pre>x & y < z', '<p>a &lt;pre&gt;x &amp; y &lt; z</p>\n'],
		[
			'an open pre tag around a tag',
			'a <pre>x <b>y</b>',
			'<p>a &lt;pre&gt;x &lt;b&gt;y&lt;/b&gt;</p>\n'
		],
		[
			'an inline script',
			'a <script>alert(1)</script> b',
			'<p>a &lt;script&gt;alert(1)&lt;/script&gt; b</p>\n'
		],
		[
			'an open script tag',
			'a <script>if (a < b && c) x',
			'<p>a &lt;script&gt;if (a &lt; b &amp;&amp; c) x</p>\n'
		]
	];
	it.each(cases)('%s is escaped to the character', (_n, md, expected) => {
		expect(renderMarkdown(md)).toBe(expected);
	});
});

describe('renderMarkdown ampersands in targets', () => {
	const exact: [string, string, string][] = [
		[
			'an angle autolink',
			'<https://x/?a=1&b=2>',
			'<a href="https://x/?a=1&amp;b=2">https://x/?a=1&amp;b=2</a>'
		],
		[
			'a bare URL',
			'https://x/?a=1&b=2',
			'<a href="https://x/?a=1&amp;b=2">https://x/?a=1&amp;b=2</a>'
		],
		[
			'a www address',
			'www.x.com/?a=1&b=2',
			'<a href="http://www.x.com/?a=1&amp;b=2">www.x.com/?a=1&amp;b=2</a>'
		],
		['an inline link with &', '[a](https://x/?a=1&b=2)', '<a href="https://x/?a=1&amp;b=2">a</a>'],
		[
			'an inline link with &amp;',
			'[a](https://x/?a=1&amp;b=2)',
			'<a href="https://x/?a=1&amp;b=2">a</a>'
		],
		[
			'an inline image with &',
			'![a](https://x/i.png?a=1&b=2)',
			'<img src="https://x/i.png?a=1&amp;b=2" alt="a">'
		],
		['a quote in the target', '[a](<https://x/a"b>)', '<a href="https://x/a%22b">a</a>'],
		[
			'a hostile title',
			'[x](https://x "\\" onerror=alert(1)")',
			'<a href="https://x" title="&quot; onerror=alert(1)">x</a>'
		],
		[
			'hostile alt text',
			'![a"><script>](https://x/i.png)',
			'<img src="https://x/i.png" alt="a&quot;&gt;&lt;script&gt;">'
		],
		[
			'a hex reference',
			'[x](java&#x73;cript:alert(1))',
			'<a href="java&amp;#x73;cript:alert(1)">x</a>'
		],
		[
			'an escaped hex reference',
			'[x](java&amp;#x73;cript:alert(1))',
			'<a href="java&amp;#x73;cript:alert(1)">x</a>'
		],
		[
			'a decimal reference',
			'![x](java&#115;cript:alert(1))',
			'<img src="java&amp;#115;cript:alert(1)" alt="x">'
		],
		[
			'a named reference',
			'[x](javascript&colon;alert(1))',
			'<a href="javascript&amp;colon;alert(1)">x</a>'
		],
		[
			'a reference link',
			'[x][r]\n\n[r]: java&#x73;cript:alert(1)',
			'<a href="java&amp;#x73;cript:alert(1)">x</a>'
		]
	];
	it.each(exact)('%s renders exactly', (_n, md, expected) => {
		expect(renderMarkdown(md)).toContain(expected);
		expect(renderMarkdown(md).trim()).toBe(`<p>${expected}</p>`);
	});

	it('leaves no target that decodes to a scheme other than http(s)', () => {
		const decode = (s: string) =>
			s.replace(
				/&(amp|lt|gt|quot|#39);/g,
				(_m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e as string] as string
			);
		for (const [, md] of exact.map((e) => e)) {
			for (const m of renderMarkdown(md).matchAll(/(?:href|src)="([^"]*)"/g)) {
				const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(decode(m[1]));
				expect(scheme === null || /^https?$/i.test(scheme[1])).toBe(true);
			}
		}
	});

	it('names a fence language without letting it out of the attribute', () => {
		expect(renderMarkdown('```a"><script>\nx\n```')).toBe(
			`${PRE}<code class="language-a&quot;&gt;&lt;script&gt;">x\n</code></pre>\n`
		);
	});
});
