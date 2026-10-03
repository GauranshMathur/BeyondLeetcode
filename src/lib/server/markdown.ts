import { Marked } from 'marked';

// Content is trusted repo content reviewed by humans (docs/content-standards.md), so no
// sanitizer, and no extensions beyond marked's defaults.
const marked = new Marked();

/** Renders Markdown content to HTML. */
export function renderMarkdown(markdown: string): string {
	return marked.parse(markdown, { async: false });
}
