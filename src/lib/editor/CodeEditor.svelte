<script lang="ts">
import { python } from '@codemirror/lang-python';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { basicSetup } from 'codemirror';
import { onMount } from 'svelte';

interface Props {
	/** The Build: path to content. The editor owns the text from here on and reports every edit. */
	files: Record<string, string>;
	/** The Build after an edit. */
	onchange: (files: Record<string, string>) => void;
	/** Stop accepting edits (e.g. after a save conflict). */
	readonly?: boolean;
}

let { files, onchange, readonly = false }: Props = $props();

// The editor takes the Build once and owns the text from there; the parent keys it per Problem.
// svelte-ignore state_referenced_locally
const paths = Object.keys(files);
// svelte-ignore state_referenced_locally
let current = { ...files };
let active = $state(paths[0] ?? '');
let host: HTMLDivElement;
let view: EditorView | undefined;
const lock = new Compartment();

// Colours come from the page's CSS variables (tokens.css), so light and dark follow the theme.
const theme = EditorView.theme({
	'&': { backgroundColor: 'var(--panel)', color: 'var(--ink)', height: '100%' },
	'.cm-scroller': { fontFamily: 'var(--font-mono)', fontSize: '14px', lineHeight: '1.8' },
	'.cm-content': { caretColor: 'var(--accent)', padding: '20px 0' },
	'.cm-cursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
	'.cm-gutters': {
		backgroundColor: 'var(--panel)',
		color: 'var(--muted)',
		borderRight: '1px solid var(--rule)'
	},
	'.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'transparent' },
	'&.cm-focused': { outline: '2px solid var(--accent)', outlineOffset: '-2px' },
	'.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
		backgroundColor: 'var(--rule)'
	}
});
const highlight = HighlightStyle.define([
	{ tag: [tags.keyword, tags.operatorKeyword, tags.definitionKeyword], color: 'var(--muted)' },
	{ tag: tags.comment, color: 'var(--muted)', fontStyle: 'italic' },
	{ tag: [tags.string, tags.number], color: 'var(--accent)' }
]);

function stateFor(path: string, doc: string) {
	return EditorState.create({
		doc,
		extensions: [
			basicSetup,
			// Only Python has a language extension; other files are plain text.
			...(path.endsWith('.py') ? [python()] : []),
			theme,
			syntaxHighlighting(highlight),
			lock.of(EditorState.readOnly.of(readonly)),
			EditorView.contentAttributes.of({ 'aria-label': `Code: ${path}` }),
			EditorView.updateListener.of((update) => {
				if (!update.docChanged) return;
				current = { ...current, [active]: update.state.doc.toString() };
				onchange(current);
			})
		]
	});
}

function open(path: string) {
	if (!view || path === active) return;
	current = { ...current, [active]: view.state.doc.toString() };
	active = path;
	view.setState(stateFor(path, current[path] ?? ''));
}

onMount(() => {
	view = new EditorView({ state: stateFor(active, current[active] ?? ''), parent: host });
	return () => view?.destroy();
});

$effect(() => {
	view?.dispatch({ effects: lock.reconfigure(EditorState.readOnly.of(readonly)) });
});
</script>

{#if paths.length > 1}
	<div class="tabs" role="tablist" aria-label="Files">
		{#each paths as path (path)}
			<button
				type="button"
				role="tab"
				aria-selected={path === active}
				class:on={path === active}
				onclick={() => open(path)}>{path}</button
			>
		{/each}
	</div>
{/if}
<div class="editor" bind:this={host}></div>

<style>
	.editor {
		flex-grow: 1;
		min-height: 320px;
		overflow: hidden;
		background: var(--panel);
	}
	.tabs {
		display: flex;
		gap: 24px;
		padding: 0 24px;
		border-bottom: 1px solid var(--rule);
		font-family: var(--font-mono);
		font-size: 13px;
	}
	.tabs button {
		background: none;
		border: 0;
		border-bottom: 2px solid transparent;
		color: var(--muted);
		font: inherit;
		padding: 14px 0 12px;
		cursor: pointer;
	}
	.tabs button.on {
		color: var(--ink);
		border-bottom-color: var(--accent);
	}
</style>
