import { Marked, Renderer, type Tokens } from 'marked';

// Content is repo content reviewed by humans (docs/content-standards.md), but the output is
// rendered with {@html} on the app's origin, so the renderer itself is the safety net: raw HTML
// is shown as text and a link or image target must be http(s) or relative. A code block and a
// table also take the keyboard focus and have a name, because they scroll sideways on a phone.
// Everything else is marked's default.

const ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

// Browsers ignore whitespace and control characters inside a scheme, so they are removed
// before the scheme is read. A target with no scheme is relative and stays.
function isSafeTarget(href: string): boolean {
	const bare = [...href].filter((c) => c.charCodeAt(0) > 0x20 && !/\p{Cc}/u.test(c)).join('');
	const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(bare);
	return scheme === null || /^https?$/i.test(scheme[1]);
}

// marked keeps a character reference such as &#x73; in an href as it is, and the browser decodes
// it, so a scheme could be spelled around the check. An author's &amp; is read as the & it
// stands for, and then every & is written once as &amp;: the browser reads the target exactly as
// it was checked, and a reference like &amp;#x73; stays inert text. An autolink is already
// escaped by marked and has no references to read.
const checkedHref = (token: Tokens.Link | Tokens.Image) =>
	token.type === 'link' && token.autolink
		? token.href
		: token.href.replace(/&amp;/g, '&').replace(/&/g, '&amp;');

const marked = new Marked({
	renderer: {
		// Raw HTML, block or inline, becomes text. The word-for-word source is kept so a
		// Chapter that writes <prev> -> <next> still reads that way.
		html(token) {
			return escapeHtml(token.text);
		},
		// After a raw <pre> or <script> tag marked leaves text unescaped, which only made sense
		// while that tag was passed through.
		text(token) {
			if ('tokens' in token && token.tokens) return false;
			return Renderer.prototype.text.call(this, { ...token, escaped: false } as Tokens.Text);
		},
		link(token) {
			if (!isSafeTarget(token.href)) return this.parser.parseInline(token.tokens);
			return Renderer.prototype.link.call(this, { ...token, href: checkedHref(token) });
		},
		image(token) {
			if (!isSafeTarget(token.href)) return escapeHtml(token.text);
			return Renderer.prototype.image.call(this, { ...token, href: checkedHref(token) });
		},
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
