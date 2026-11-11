# Sprints

Sprints are goal-based, not time-boxed: a sprint ends when its exit criteria hold. Every card carries a Sprint field on the board (IDs in `docs/agents/board.md`). The orchestrator works one sprint at a time and does not pull cards from a later sprint until the current one exits.

**Size and release** (from Sprint 14). A sprint is one coherent theme drawn from the open issues, typically 12 to 25 cards; each card is still one PR. A sprint is the unit of release: it ends with one release, whose version the `sprint-planner` picks when it plans the sprint and whose last card sets it with `Release-As`. Its changelog has fixed headings and is reviewed before the release PR merges (`docs/releasing.md`).

**Ordering rule.** Each screen is designed in the sprint that builds it, or the one just before. Foundations rules come first so every later screen is built responsive from day one. The one exception is mobile boards, which wait for Sprint 5.

**Only the current and planned sprints** (the maintainer's rule, 2026-11-10). When a sprint exits, its last card moves the sprint's section, its Status included, to `docs/sprints-archive.md`, which holds Sprints 0 to 18.

**The Backlog** (the maintainer's decision, 2026-11-11). Every open issue has a ticket on the board with Status Backlog and no sprint. The planner pulls from the Backlog by priority when it plans the next sprints. Only critical work joins the sprint in progress: a bug that hurts users, a security problem, a broken CI or release, or something a planned card cannot be built without. The rules are in `docs/agents/board.md`, Issues are the unit of work.

**Issues first** (the maintainer's rule, 2026-11-10, #591). Each sprint plans issues, and its cards say how each issue is done. Each sprint's section lists issue → cards, with the last card that closes each issue. The rules are in `docs/agents/board.md`, Issues are the unit of work.

## Sprint 19 · Accessibility

**Goal:** the 2026-11-08 accessibility audit's findings are fixed. Run, Submit and Hint results are announced and focus lands where the Learner is; same-page navigations and saves keep focus; the Registration and Theme selects wait for Save; every Users action names its target; text and focus marks pass contrast; the Problem screen reflows at 400% zoom; and every screen has one `main`, a title and one h1, with a test that keeps it so. The Markdown renderer stops passing raw HTML, which also restores two Chapters' lost words.

Release `R v1.19.6: Sprint 19 · Accessibility`, version 1.19.6 (patch, because no card is `feat`: the cards are `fix` and `test`, and five design cards open no PR). Milestone `Sprint 19 · Accessibility`.

- **Re-planned issue first on 2026-11-10** by the Fable `sprint-planner`, under the maintainer's rules of that day (#591): issues are the unit of work, small cards share a PR, and an architecture finding is planned only if it is a bug, a security problem or blocks a planned feature. The old Sprints 19 to 23 (C247 to C339, F18, F19, P11 and S2) are archived on the board. Each issue was read against `main` at ac562aa.
- **Scope.** The accessibility issues #522 to #528, #529's no-dependency half, and #533 (its lost words are a reading fault, and its fix shares the renderer with #528's h1 rule). And #616, added on 2026-11-11 before the sprint started: on a phone, an Account held on the Change password page has no visible Sign out, a bug on one screen, cut into one design card and one code card in free rounds.
- **Twenty-five cards: C347 to C365, C384, and the design cards F20, F21, P12, S3 and AC3.**
  - **The Problem screen** (`ProblemWorkspace.svelte`, `problem.e2e.ts`):
    - C347: the workspace is the page's `main` (#528), and C348: the tabs carry the reset attribute SvelteKit 3 reads (#523). Both are small: lane A's batch PR.
    - C350: one console live region, and real roles for the Verdict and the Accepted panel (#522).
    - C352: a busy control keeps focus, and focus moves to what replaces a removed one (#522). It builds on C243's read of what the Learner may do now.
    - C355: autosave announces only what needs action (#522).
    - C363: the editor's selection match and the Language select pass contrast (#526).
    - C364: at a short viewport the bars give the statement room (#527), after P12's board.
  - **Markdown and the Chapter:** C349: the renderer escapes raw HTML and drops unsafe link targets (#533). Then C351: a leading h1 that repeats the title is dropped (#528), and C353: reaching a Chapter's end keeps focus (#523, small).
  - **Settings and Users:**
    - C356: the Theme select waits for Save, and focus stays on what was used (#524, #523).
    - C357: each Users action names its user or Invite (#525), then C359: the Registration select waits for Save (#524), then C361: focus goes to what an action shows (#523).
  - **Tokens and the Map:**
    - C354: the Map's current Topic gets its own focus mark (#526, small).
    - C358: the light accent is `#ae3f1d`, and `contrast.test.ts` holds the audit's pairs (#526, #529).
  - **Errors and the check:** C360: a root error page with a title and a `main` (#528), and C362: one e2e checks one `main`, a title and one h1 on every screen (#529, option 2).
  - **The Change password page:** C384: the forced variant gets a Sign out form that posts to `/settings?/signout`, which the gate already allows, so a held Account can sign out at every width (#616), after AC3's board. `gate.ts`, `header.ts` and the signout action do not change.
  - **Design** (the canvas, `card-designer`), one design lane in this order: F20, the light accent is `#AE3F1D` in `tokens()`; F21, a focus mark for an already-accented box; P12, the Problem phone board at 320×256; S3, the error page; AC3, the Change password board's forced variant shows Sign out (Account page).
  - **Last:** C365, the exit check and `Release-As: 1.19.6` (`docs/releasing.md`, The last card). It has no issue.
- **Issues → cards.** Each issue closes when its last card merges (`docs/agents/board.md`, Issues are the unit of work). The milestone `Sprint 19 · Accessibility` holds each of these issues but #529.

  | Issue | Cards, in order | Last card | Lane conflicts (shared files, in this order) | Risks and review | Acceptance check |
  |---|---|---|---|---|---|
  | #533 Markdown renders raw HTML | C349 | C349 | `markdown.ts` and its test: C349, then C351 (#528) | Response content: the two-reader review. A stricter rule could change how a Chapter renders; the test pins the two Chapters' words | `markdown.test.ts` shows `<prev> -> <next>` as text and a `javascript:` link without its target |
  | #528 No main, untitled errors, two h1s | C347, C351, S3, C360 | C360 | `ProblemWorkspace.svelte` and `problem.e2e.ts`: C347 first in lane A; `markdown.ts`: after C349; `chapter.e2e.ts`: C351, then C353 (#523) | C351 edits the Markdown renderer, so it takes the two-reader review under the maintainer's standing rule (recorded on its card, 2026-11-11): the readers check that only a heading the title repeats is dropped, and that nothing C349 escapes comes back. C351 changes rendering for 76 Chapters and 128 Problems; the e2e counts h1s. S3 before C360 (design first) | `error.e2e.ts` finds a title, one `main` and one h1 on a 404 and a 403; `getByRole('heading', { level: 1 })` matches one element on a Chapter and a Problem |
  | #522 Results not announced, focus lost | C350, C352, C355 | C355 | `problem.e2e.ts`: after C347 and C348; `ProblemWorkspace.svelte`: C347, C352, C355, then C363, C364 | None for security. C352 depends on Sprint 18's C243 (`workspace.ts`) | `problem.e2e.ts` reads the Verdict from one `getByRole('status')` and checks focus with `toBeFocused()` after Run, Submit, Reveal hint, Cancel, a restart and a switch |
  | #523 Focus jumps to the top | C348, C353, C356, C361 | C361 | `+page.svelte` (Problem): C348, C352, then C364; `chapter.e2e.ts`: after C351; `users/+page.svelte`: C357, C359, then C361; `settings/+page.svelte`: C356 only | None for security. C356 carries #524's open question (see below) | `grep -rn "data-sveltekit-noscroll" src` prints nothing, and each e2e finds the trigger or the new content `toBeFocused()` |
  | #524 Selects save on every change | C356, C359 | C359 | `users/+page.svelte`: after C357 | C359 changes the Registration Mode's form: the two-reader review. Maintainer's question: keep the Save button, or say beside the select that choosing saves? Recommended: keep it, on both selects | `registration.multi.e2e.ts` and `settings.e2e.ts` arrow through each select and see nothing posted until Save |
  | #525 Users actions name no user | C357 | C357 | `users/+page.svelte` and `users.multi.e2e.ts`: C357 first | None: names only | `users.multi.e2e.ts` finds each action by its full name and each name cell by role `rowheader` |
  | #526 Contrast and the Map's focus | F20, F21, C354, C358, C363 | C363 | `tokens.css` and `contrast.test.ts`: C358, then C363; `ProblemWorkspace.svelte`: C363 after C355 | None for security. F20 edits every artboard's `tokens()`; its designer reports the count before splitting | `contrast.test.ts` passes with the light accent at `#ae3f1d` and the selection-match token, and fails on `#b4421f` |
  | #527 400% zoom leaves 29 px | P12, C364 | C364 | `ProblemWorkspace.svelte`, `+page.svelte` and `problem.e2e.ts`: last in lane A; `breakpoints.ts`: C364 only | None for security. A new height query must be named in `breakpoints.ts` (#244's guard) | `problem.e2e.ts` at 320×256 finds the statement pane at least as tall as P12 marks it |
  | #529 An automated check (no-dependency half) | C358, C362 | none: it stays open | `contrast.test.ts`: C358 (shared with #526); the two e2e files are new | None. axe, a new dependency, is the maintainer's hard call; #529 keeps `needs-triage` and no milestone | `a11y.e2e.ts` and `a11y.multi.e2e.ts` find one `main`, a title and one h1 on every screen, in both themes, on desktop and phone |
  | #616 A held Account has no visible Sign out on a phone | AC3, C384 | C384 | None: no other card edits `account/password/` or `ChangePassword.dc.html`; C384's one comment line in `AppHeader.svelte` is shared with no card | None for security: no rule, header or action changes; the form posts to the action the gate's exception already allows (`gate.ts`, `isSigningOut`). Decided from the issue's two options: the control goes on the page, not the narrow header, so F.10f's phone rule and `header.ts` stay. AC3 before C384 (design first) | `password.multi.e2e.ts`, at `phone.viewport`, finds a Sign out button inside `main` on the forced Change password page, and clicking it lands on `/signin` |

  - C358 serves #526 and #529: its `Issue` field holds 526, and its `Refs` line names both. C356 serves #524 and #523: its `Issue` field holds 524.
  - C365, the exit check, has no issue.
- **Waiting on the maintainer**, with a recommended answer the orchestrator takes unless the maintainer says otherwise:
  - **#524: keep the Save button after hydration, or say beside the select that choosing saves?** Recommended: keep the Save button, on both selects, and leave focus on the select after a save. C356 carries the `Blocked by:` line; C359 follows it. Not a hard call.
  - **#529: add `@axe-core/playwright` as well?** A new dependency: a hard call. No card adds it; #529 stays open and `needs-triage`.
  - **#533's optional layers**, the content check failing on any HTML token and a script CSP (`kit.csp`): recommended to leave them for later. A CSP is a response-header change, so it is the maintainer's. Not planned.
- **Small cards share a PR** (`docs/agents/board.md`): lane A's batch is C347 and C348, built together in round 1; lane B's batch is C353 and C354, built together in round 3, after C351 and F21. Each batch PR is one round and takes the `fix` type.
- **Reviews.**
  - The orchestrator's two-reader review (Fable and Codex): C349 (response content), C351 (the Markdown renderer, `src/lib/server/markdown.ts`, under the maintainer's standing rule: Identity, the gate, headers, CI secrets and the Markdown renderer) and C359 (the Registration Mode).
  - None for the rest: screens, styles and tests, with no rule, header or Runner change. C384 adds a form that posts to the sign-out action the gate already allows, and changes no rule. No card touches `src/lib/server/runner/`.
- **Design first.** The canvas is the source of truth for how a screen looks (`docs/agents/design-canvas.md`), so F20 comes before C358, F21 before C354, P12 before C364, S3 before C360 and AC3 before C384. The design lane runs F20, F21, P12, S3, AC3 in order. Design cards use the canvas, not the host's heavy jobs.
- **Shared files**, each an ordered chain in one lane:
  - `ProblemWorkspace.svelte`: C347, C352, C355, C363, then C364 (lane A).
  - `problem.e2e.ts`: C347 and C348 (one PR), C350, C352, C355, then C364 (lane A).
  - `problems/[problemId]/+page.svelte`: C348, C352, then C364 (lane A).
  - `users/+page.svelte`: C357, C359, then C361. `users.multi.e2e.ts`: C357, then C361 (lane A).
  - `markdown.ts` and `markdown.test.ts`: C349, then C351 (lane B). `chapters/chapter.e2e.ts`: C351, then C353 (lane B).
  - `styles/tokens.css` and `contrast.test.ts` (new in C358): C358 (lane B), then C363 (lane A).
- **Two lanes a round** (`docs/agents/board.md`, Resources), plus the design lane. Lane A holds the Problem screen and Users; lane B the Markdown, Chapter, Settings, tokens, Map, errors and the e2e check. The e2e runs take the shared heavy lock one at a time.

  | Round | A · Problem screen and Users | B · Markdown, Chapter, Settings, tokens, Map, errors | Design |
  |---|---|---|---|
  | 1 | C347 `main` + C348 tabs (#528, #523; batch) | C349 Markdown escapes HTML (#533) | F20 light accent |
  | 2 | C350 live region (#522) | C351 leading h1 (#528) | F21 focus mark |
  | 3 | C352 focus after actions (#522) | C353 Chapter's end + C354 Map focus (#523, #526; batch) | P12 Problem at 320×256 |
  | 4 | C355 autosave (#522) | C356 Settings (#524, #523) | S3 error page |
  | 5 | C357 Users names (#525) | C358 accent and contrast test (#526, #529) | AC3 Change password's Sign out |
  | 6 | C359 Registration select (#524) | C360 error page (#528) | |
  | 7 | C361 Users focus (#523) | C362 accessibility e2e (#529) | |
  | 8 | C363 editor and select (#526) | C384 Change password's Sign out (#616) | |
  | 9 | C364 short viewport (#527) | | |
  | 10 | C365 exit check and `Release-As: 1.19.6` | | |

  If the maintainer has not answered #524 by round 4, lane B runs C358 and C360 first and C356 waits; C359 and C361 then move later in lane A. C384 needs only AC3, so it can take any free lane B round after round 5.
- **Rounds: 14.**
  - The longest chain is nine cards (lane A: C347 and C348, C350, C352, C355, C357, C359, C361, C363, C364), under the ten-card line, and lane A's nine rounds set the build. #616's chain (AC3, then C384) is two cards in free rounds and adds none.
  - There are three security reviews (C349, C351 and C359), which run while the other lane builds.
  - The last card and the cut add one round each.

**Exit:**
- All 25 Sprint 19 cards are Done, and `ci` is green on `main`. The sprint's Status counts both issues closed and cards done.
- `markdown.test.ts` shows raw HTML escaped and a `javascript:` link without its target, and `graphs-lockdep` shows `<prev> -> <next>` as text.
- `a11y.e2e.ts` and `a11y.multi.e2e.ts` find one `main`, a title and one h1 on every screen, in both themes, on desktop and phone.
- `contrast.test.ts` passes, and holds the light accent, the selection match and the select's border.
- `problem.e2e.ts` checks focus after Run, Submit, Reveal hint, Cancel, a restart and a Language switch, and the statement's height at 320×256.
- `grep -rn "data-sveltekit-noscroll" src` prints nothing.
- `password.multi.e2e.ts` signs a held Account out from the Change password page at the phone viewport.
- #522, #523, #524, #525, #526, #527, #528, #533 and #616 are closed, 9 issues. #529 stays open for the axe question.
- The orchestrator cuts 1.19.6 from the release PR and records the cut. Releases stay `1.x`.

**Not in the sprint:**
- **`@axe-core/playwright`** (#529's option 1): a new dependency, the maintainer's call.
- **A script CSP and an HTML check in the content check** (#533's optional layers): the maintainer's call; a CSP is a response-header change.
- **#582's theme item** (`theme.ts` owning the theme cookie), which the old plan ran beside #524: #582 waits in the Backlog.
- **The 28 `architecture` refactor issues** (#500 to #505, #515, #516, #519, #520, #560, #561, #562, #566 to #569, #571, #573 to #582): none is wontfix (the maintainer's decision, 2026-11-11). Each has a Backlog ticket, and later sprints draw from them.
- **The plan was re-checked on 2026-11-11** under the Backlog rule. The one security card, C349 (the renderer escapes raw HTML), runs in round 1. No Backlog ticket is critical, so none joins this sprint.

## Sprint 20 · Drifted rules and docs

**Goal:** four rules that drifted from their one home are put back, and the five docs an agent or operator reads first say what the code does. What a valid new Account looks like is one check that Setup and Sign up share, and every sign-up refusal has one total answer; the scripted Runner reads the Main Line from the catalogue; every Runner failure is logged by kind on both sides, and the core's rule stays RunnerUnavailable; the Map's current Topic is decided once and is always open. The module map, mvp1.md's Shipping section, the sandbox reviewer's checklist, the ADRs, the compose file `init` writes and self-hosting match the code, with a Runner troubleshooting section built on the new logs.

Release `R v1.19.7: Sprint 20 · Drifted rules and docs`, version 1.19.7 (patch, because no card is `feat`: the cards are `fix`, `refactor`, `test` and `docs`). Milestone `Sprint 20 · Drifted rules and docs`.

- **Scope.** The architecture issues kept as bugs under the maintainer's rule of 2026-11-10: #514, #517, #565 and #572, read with the Sprint 17 architecture report's findings 10, 26, 17 and 27. And the docs issues #507 to #511, which come after the sprints whose code they describe (Sprint 18's Identity seams and this sprint's #514 and #565).
- **Eighteen cards, C366 to C383.**
  - **Identity** (`identity/`, the Setup and account-form routes): C366: one new-Account field check, and the first Admin's sign-up answers refusal codes (#514). Then C371: the Setup route maps the codes and `InvalidFirstAdminError` goes (#514). Then C373: one module answers every sign-up refusal, total not partial, and the forms take their limits from `ACCOUNT_LIMITS` (#514).
  - **Runner** (`runner/`): C378: the HTTP adapter classifies each failure and logs it once by kind (#565), then C380: the Runner logs its 400s and 401s (#565). C381: the scripted Runner answers an Extra's Reference Code from the Main Line place (#517).
  - **The Map:** C374: the current Topic is decided once in `mapView`, and is always an open Topic (#572), then C377: one pure Map-entries function feeds the figure and the column (#572).
  - **Comments** (small, lane A's batch PR): C375: `accept.ts` and `app.ts` say what the code does (#508); C376: the Runner config, the Dockerfile and `db.ts` point at the right doc, roles and path (#511).
  - **Docs and init:**
    - Small, lane B's batch PR: C367: `compose.yaml` drops the pull note and passes `RUNNER_MAX_CONCURRENT` (#507); C368: mvp1.md's Shipping section (#509); C369: board.md names the worktree steps, not superpowers skills (#510); C370: ADRs 0002, 0004 and 0006 point at the right doc, roles and tests (#511).
    - C372: the sandbox reviewer checks the Sandbox as it is (#510).
    - C379: the module map's Identity and Web rows, with rows for `logging.ts` and `languages.ts` (#508).
    - C382: self-hosting's first-start, capacity and Runner troubleshooting notes, and two fixed sentences (#507).
  - **Last:** C383, the exit check and `Release-As: 1.19.7`. It has no issue.
- **Issues → cards.** The milestone `Sprint 20 · Drifted rules and docs` holds each of these issues.

  | Issue | Cards, in order | Last card | Lane conflicts (shared files, in this order) | Risks and review | Acceptance check |
  |---|---|---|---|---|---|
  | #514 The first admin's sign-up has drifted | C366, C371, C373 | C373 | `setup.ts`: C366, then C371; `accept.ts`: C373, then C375 (#508) | Identity: every card gets the two-reader review. ADR 0006 holds: the Invite claim stays last in `user.create.before`. The texts Setup shows do not change | `setup.test.ts` shows " ada@example.com" accepted as by `signUp`; a `RefusalCode` with no answer fails `bun run check`; `grep -rn "InvalidFirstAdminError" src` prints nothing |
  | #565 Every Runner failure is silent | C378, C380 | C380 | None; `http-adapter.ts` and `server.ts` are each one card's | `sandbox-security-reviewer` on both. A log line must carry no token, Build or input: by kind only | `http-adapter.test.ts` maps each status to a kind and one log line; `server.test.ts` shows one line for a 401 and each 400 |
  | #517 The scripted Runner gets Extras wrong | C381 | C381 | None | `sandbox-security-reviewer` (test code under `runner/`). The finding's indexer split is a refactor and is not planned | `grep -n "indexOf" src/lib/server/runner/scripted-catalogue.ts` prints nothing, and its test accepts `stacks-peek`'s Reference Code |
  | #572 The current Topic can be Locked | C374, C377 | C377 | None with another issue; `rules.ts` is C374's alone this sprint | None for security. Decision taken from the issue: current is the open Topic with the most recent activity, or none | `rules.test.ts` answers the most recent open Topic for a Locked most-recent one; `entries.test.ts` covers each state |
  | #507 compose.yaml and self-hosting slips | C367, C382 | C382 | None; C382 waits for C380's failure kinds | Maintainer's question on C367: pass `RUNNER_MAX_CONCURRENT` through, or document that `.env` does not reach the runner? Recommended: pass it as `${RUNNER_MAX_CONCURRENT:-}`. Not a hard call. No mount, flag or socket change | `compose.yaml` holds no pull note and passes `RUNNER_MAX_CONCURRENT`; self-hosting has a Runner troubleshooting section |
  | #508 module-map's Identity rows | C375, C379 | C379 | `accept.ts`: after C373; `module-map.md`: C379 only (Sprint 18's C233 and C241 edit it earlier) | None. The row must name only seams that exist after C373 | Every Identity seam the row names exists in `src/lib/server/identity/`, and the map has rows for `logging.ts` and `languages.ts` |
  | #509 mvp1.md's Shipping section | C368 | C368 | None | None. k6 is marked not built, not dropped | `grep -n "fully automatic\|no token" docs/product/mvp1.md` prints nothing |
  | #510 The sandbox reviewer's image rule | C369, C372 | C372 | None | C372 edits the security reviewer's definition: the two-reader review. No security rule changes | The reviewer names the two GHCR Sandbox images and Go's `/exec`; `grep -n "superpowers:" docs/agents/board.md` prints nothing |
  | #511 ADRs and three comments | C370, C376 | C376 | None; C376's batch PR follows C373 because of C375 | C376 touches `runner/config.ts` (a comment), so lane A's batch PR gets `sandbox-security-reviewer` | `grep -rn "README, Upgrading\|k6 tests watch" docs/adr` and `grep -n "README's reverse-proxy\|two roles\|app\.db" src/lib/server/runner/config.ts Dockerfile src/lib/server/db.ts` print nothing |

  - C383, the exit check, has no issue.
- **Waiting on the maintainer**, with a recommended answer the orchestrator takes unless the maintainer says otherwise:
  - **#507: pass `RUNNER_MAX_CONCURRENT` through `compose.yaml`, or say that `.env` does not reach the runner?** Recommended: pass it as `${RUNNER_MAX_CONCURRENT:-}`; an empty value keeps the CPU-count default, and only the file `init` writes for new Instances changes. C367 carries the `Blocked by:` line, so lane B's batch PR waits for it. Not a hard call.
  - **#517's larger step**, a pure catalogue indexer that `rules.test.ts` and the fake both use (the report's finding 26): a refactor, not a bug. Not planned here: it is #623, in the Backlog.
- **Decided from the issues** (their own direction, not a new choice): #572's current Topic is the open Topic with the most recent activity, or none; #509 marks k6 as not built; #565 keeps the core's rule (every failure is RunnerUnavailable) and leaves the 503s unlogged on the Runner side; #510 changes no security rule.
- **Small cards share a PR:** lane A's batch is C375 and C376, built together in round 4 after C373 (`docs` type, `sandbox-security-reviewer` for `config.ts`); lane B's batch is C367, C368, C369 and C370, built together in round 1 (`fix` type, from C367). Each batch PR is one round.
- **Reviews.**
  - The orchestrator's two-reader review (Fable and Codex): C366, C371 and C373 (Identity) and C372 (the sandbox reviewer's definition).
  - `sandbox-security-reviewer` before merge: C378, C380, C381, and lane A's batch PR (C375 and C376), for `runner/config.ts`.
  - None for the rest: docs, the Map and `compose.yaml`'s environment line.
- **Shared files**, each an ordered chain in one lane:
  - `identity/setup.ts`: C366, then C371 (lane A).
  - `invite/[token]/accept.ts`: C373, then C375 (lane A).
- **Two lanes a round.** Lane A holds the code with reviews (Identity, the comments, the Runner); lane B the docs, init and the Map. The `sandbox` tests take the shared heavy lock one at a time.

  | Round | A · Identity, comments and Runner | B · Docs, init and the Map |
  |---|---|---|
  | 1 | C366 field check (#514) | C367 compose + C368 mvp1 + C369 board.md + C370 ADRs (#507, #509, #510, #511; batch) |
  | 2 | C371 Setup route (#514) | C372 sandbox reviewer (#510) |
  | 3 | C373 account forms (#514) | C374 current Topic (#572) |
  | 4 | C375 + C376 comments (#508, #511; batch) | C377 Map entries (#572) |
  | 5 | C378 adapter kinds (#565) | C379 module map (#508) |
  | 6 | C380 Runner logs (#565) | |
  | 7 | C381 scripted Runner (#517) | C382 self-hosting (#507) |
  | 8 | C383 exit check and `Release-As: 1.19.7` | |

  If the maintainer has not answered #507 by round 1, lane B runs C372, C374 and C377 first and the batch waits.
- **Rounds: 17.**
  - The longest chain is five cards (C366, C371, C373, the comments batch, then C379 in lane B), and lane A's seven rounds set the build.
  - There are eight reviews: four security and four sandbox.
  - The last card and the cut add one round each.
- **No limit, flag or image changes.** C367 adds an environment line to the runner service. C378 and C380 add log lines, by kind. C381 changes what the scripted fake answers, not what the Runner accepts.

**Exit:**
- All 18 Sprint 20 cards are Done, and `ci` is green on `main`. The sprint's Status counts both issues closed and cards done.
- `grep -rn "InvalidFirstAdminError\|MultiUserNotAvailableError" src/routes/setup src/lib/server/identity/setup.ts` prints nothing, and a `RefusalCode` with no answer fails `bun run check`.
- `http-adapter.test.ts` holds a status-to-kind table, and `server.test.ts` shows a log line for a 401 and for each 400.
- `grep -n "indexOf" src/lib/server/runner/scripted-catalogue.ts` prints nothing.
- `entries.test.ts` passes, and a `rules.test.ts` row answers an open Topic as current when the most recent one is Locked.
- `grep -n "C4d\|docker pull" src/lib/server/init/compose.yaml`, `grep -n "fully automatic\|no token" docs/product/mvp1.md`, `grep -n "superpowers:" docs/agents/board.md` and `grep -rn "README, Upgrading\|k6 tests watch" docs/adr` print nothing.
- `docs/self-hosting.md` has a Runner troubleshooting section, and `docs/module-map.md` has rows for `logging.ts` and `languages.ts`.
- #507, #508, #509, #510, #511, #514, #517, #565 and #572 are closed, 9 issues.
- The orchestrator cuts 1.19.7 from the release PR and records the cut. Releases stay `1.x`.

**Not in the sprint:**
- **#517's catalogue indexer** (#623) and **#514's screen half (#501)**: refactors, in the Backlog.
- **#570**, the release webhook's shared notify script: card C340 with no Sprint, after C220 and C221, which wait on #535.
- **Sprints 21 to 23.** The backlog fills two sprints. Their Sprint options are renamed `Sprint 21 · Unplanned`, `Sprint 22 · Unplanned` and `Sprint 23 · Unplanned`, and their Release options `R v1.19.8: Sprint 21 · Unplanned` and so on (2026-11-10). They hold no cards; the planner fills and renames them from the Backlog.

## After each build sprint

After a sprint is released, a separate session reviews the architecture (`docs/agents/board.md`, After a major feature). Every finding becomes an issue with a Backlog ticket. A critical one joins the current sprint, and the planner pulls the rest by priority.
