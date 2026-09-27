# Design canvas

The UI is designed in a Claude Design canvas: https://claude.ai/artifact/WRJr84ccDYXAd3Yg1Xvp1d. It is the source of truth for how every screen looks. Code cards build to it.

## Files

Everything lives under `project/`:

- `canvas.json` is the index: `boards` (file → page, position, size, title), `pages`, `notes` (titles and STATUS stickies), `order`, `launch`. **Only the orchestrator edits it.**
- `<Name>.dc.html` is one light artboard. `<Name>-dark.dc.html` is its dark wrapper.

Before editing any file, read it fresh from the canvas (`Artifact` action `read` with `path`). Publish only the files you changed. If a publish is refused because someone saved meanwhile, re-read those files and redo the edit once; a second refusal goes to the orchestrator.

## Pages

| Card prefix | Page id | Name |
|---|---|---|
| `F` | `foundations` | 0 · Foundations |
| `P` | `practice` | 1 · Practice (Map, Topic, Problem) |
| `R` | `reading` | 2 · Reading (Chapter) |
| `A` | `auth` | 3 · Auth |
| `AD` | `admin` | 4 · Admin |
| `AC` | `account` | 5 · Account |
| `S` | `system` | 6 · System |
| | `backlog` | Backlog · MVP1 (a pointer to the board) |
| | `archive` | Archive (out of MVP1: Landing, Progress, Readings) |

## Layout on a page

- Desktop artboards are 1440 wide. Light at `x: 0`, its dark twin at `x: 1520`, same `y`.
- Stack further artboards down the page with a ~420px gap, and a `title1` note 300px above each.
- The page's STATUS sticky sits at `x: 3040, y: 0`.
- Mobile artboard width and rules come from Foundations once F3 lands.

## Foundations first

Foundations is the pattern library. A board uses only patterns Foundations shows. A pattern it lacks becomes a new `F` card (report it to the orchestrator); it is never invented on a board.

## Theme

Every light artboard declares `theme` and `accent` props and reads every color from `tokens()`. Copy this block verbatim into a new artboard's `<script type="text/x-dc">`, and write colors in markup as `{{t.paper}}`, `{{t.ink}}` and so on:

```js
tokens(theme, accent) {
var d = theme === 'dark';
var acc = { vermilion: ['#B4421F', '#E0704A'], blue: ['#1F4E8C', '#7FA8E0'], green: ['#2F6B3A', '#7DB88A'] }[accent] || ['#B4421F', '#E0704A'];
return { paper: d ? '#171512' : '#F3EEE4', panel: d ? '#211E1A' : '#ECE5D8', field: d ? '#1C1915' : '#FBF8F2', ink: d ? '#ECE5D8' : '#1C1A17', body: d ? '#CFC6B8' : '#3A352E', muted: d ? '#A89F92' : '#5B5348', rule: d ? '#3A352E' : '#D9CFBE', onInk: d ? '#171512' : '#F3EEE4', accent: acc[d ? 1 : 0] };
}
renderVals() {
return { t: this.tokens(this.props.theme ?? 'light', this.props.accent ?? 'vermilion') };
}
```

with `data-props='{"theme":{"editor":"enum","options":["light","dark"],"default":"light"},"accent":{"editor":"enum","options":["vermilion","blue","green"],"default":"vermilion"},"$preview":{"width":1440,"height":<H>}}'`.

The dark wrapper imports the light file and adds nothing else. Swap in the name and size:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>BeyondLeetcode — <name>, dark</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<style>
body{margin:0}
</style>
</helmet>
<div style="width: <W>px; height: <H>px; background: #171512">
<dc-import name="<Name>" theme="dark" hint-size="<W>px,<H>px"></dc-import>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":<W>,"height":<H>}}'>
class Component extends DCLogic {
renderVals() {
return {};
}
}
</script>
</body>
</html>
```

## Look

"Technical book + line diagrams": warm paper and ink, one accent, thin ruled lines, figures drawn as labelled SVG line diagrams with a `Fig. N` caption.

- Fonts: Newsreader (reading text, headings), Barlow Condensed 600 uppercase (the wordmark), IBM Plex Mono (labels, buttons, code, data). Load them with the Google Fonts `<link>` already in any artboard's `<helmet>`.
- Corners are 2px. Borders are 1px `ink`; dividers are 1px `rule`.
- `accent` marks the one thing that matters on a screen (the current item, the active path in a figure). Everything else is ink.
- Placeholder copy stays in `[brackets]` unless it shows layout only; see `docs/content-standards.md` ("Mockups are not content").

Exact sizes and spacing are whatever Foundations shows; read it rather than guessing.

## STATUS sticky

Each page has one sticky, id `s-<page>`, rewritten by the orchestrator after every round:

```
STATUS · <v1 done | needs MVP1 work | not started>

<open card codes> on the GitHub board.
<one line on what is still missing>
```

Fill: `green` done, `orange` in progress, `blue` draft, `gray` not started or archived. When a page has no open cards, it reads `STATUS · MVP1 done` in green.
