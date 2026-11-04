import { Marked, Renderer } from 'marked';

// Content is trusted repo content reviewed by humans (docs/content-standards.md), so no
// sanitizer. The only extension names the two things that scroll sideways on a phone: a code
// block and a table take the keyboard focus and have a name. Everything else is marked's default.
const marked = new Marked({
	renderer: {
		code(token) {
			return Renderer.prototype.code
				.call(this, token)
				.replace(/^<pre>/, '<pre tabindex="0" role="group" aria-label="Code block">');
		},
		table(token) {
			const html = Renderer.prototype.table.call(this, token).trimEnd();
			return `<div class="scrollbox" tabindex="0" role="group" aria-label="Table">${html}</div>\n`;
		}
	}
});

/** Renders Markdown content to HTML. */
export function renderMarkdown(markdown: string): string {
	return marked.parse(markdown, { async: false });
}
