# Sprints

Sprints are goal-based, not time-boxed: a sprint ends when its exit criteria hold. Every card carries a Sprint field on the board (IDs in `docs/agents/board.md`). The orchestrator works one sprint at a time and does not pull cards from a later sprint until the current one exits.

**Ordering rule.** Each screen is designed in the sprint that builds it, or the one just before. Foundations rules come first so every later screen is built responsive from day one. The one exception is mobile boards, which wait for Sprint 5.

## Sprint 0 · Agent setup

**Goal:** agents can work the board without asking how.

- Product and stack decisions written down (`docs/product/mvp1.md`).
- Canvas rules and tokens written down (`docs/agents/design-canvas.md`).
- Board protocol: Owner claim, card size and splits, done bars per card type, blocked flow, worktree → PR flow (`docs/agents/board.md`).
- `/orchestrate` skill; `card-designer`, `card-builder`, `sandbox-security-reviewer` agents.
- `.claude/settings.json`: board and git allowlist, secret-file edit block. Svelte MCP in `.mcp.json`.
- Board: Owner and Sprint fields; `architecture` label.
- Machine-independent: all state on GitHub and the canvas; project settings install the plugins the workflow uses, so `/orchestrate` resumes the same from any local clone. Cloud sessions are not supported (no plugins, no `gh project`).

**Exit:** all of the above committed on `main`.

## Sprint 1 · Design foundations

**Goal:** MVP1 is specified, and every screen on the skeleton path is designed.

- **Spec (with the maintainer):** `domain-modeling` → `CONTEXT.md`; ADRs for the decisions in `mvp1.md`; `to-spec`; `codebase-design` for the module map.
- **Foundations (one lane, first):** F1 result states, F2 core/extra marker + issue link, F3 mobile rules.
- **Skeleton screens (parallel lanes, after F):** P1 Map nav + search, P3 Topic as chapters → problems, R1 Chapter → Topic + problems, P7 language picker + report link, P8 run/submit states, P9 Accepted panel, S1 Local nav.

**Exit:** all 10 cards Done; `CONTEXT.md`, ADRs, spec and module map merged.

## Sprint 2 · Walking skeleton

**Goal:** one problem works end to end in Local mode, shipped as a released image.

- Scaffold: SvelteKit + Bun + Prisma/SQLite + Biome + Vitest + Playwright.
- CI, release-please, the multi-arch GHCR image, `init` + `compose.yaml`, the runner sandbox.
- Map → Topic → Chapter → Problem → run → Accepted, in Python, TypeScript and Go.
- A PostToolUse hook runs Biome on edited files.

**Exit:** `docker compose up` from a released image solves that one problem; CI green on `main`.

**Status (2026-10-04):** exit met on release `v0.21.0`: `init` + `docker compose up` from the published image, then the smoke test solved the fixture Problem in Python, TypeScript and Go. C10b shipped the first real Topic, dynamic arrays, in `v0.22.0` (`content/`, researched in `docs/research/`); its human source review was skipped at merge and is tracked in #113. Decided along the way: our own Sandbox images for TypeScript and Go (ADR 0002, amended), TypeScript type errors are Compile Errors, releases publish `vX.Y.Z` and `latest` only after the full CI run on the released source, `edge` on every merge.

## Sprint 3 · Learning loop

**Goal:** the full single-learner experience.

- Design: P5 Hints tab, P6 Solution tab (always visible), AC1 Settings (Local variant).
- Build: topic hard-locks and completion (all chapters read + core problems solved), core/extra problems, hints, the always-visible Solution tab, the topic-complete Accepted variant, report-an-issue links, Settings.

- First, before any feature card (decided 2026-10-04, from the architecture review after Sprint 2): one owner for "what did this action change?" (#103); the Problem screen's single "save, then act" path, its state machine and the rules moved back into the core (#102, #105, #106); one shared list of Languages plus TypeScript and Go highlighting (#101, cut down). #104 and #107 wait until after `v1.0.0`.

**Exit:** a learner in Local mode can finish a topic and unlock the next; all Sprint 3 cards Done.

**Status (2026-10-11):** exit met, checked by a browser test (C21): a Learner in Local mode reads both Stacks Chapters, solves both Core Problems with the Reference Code, sees the "Topic complete" panel name Queues, and the Map shows Stacks complete and Queues unlocked. Built this sprint: one module for progress events (C14, #103); one list of Languages with TypeScript and Go highlighting (C15, #101, cut down); the Problem screen's one save-then-act path and its state machine as a tested module (C16a and C16b, #102, #105, #106); Hints (C17); the Solution tab (C18); report-an-issue links (C19); Settings for Local mode with the theme and Reset progress (C20a, C20b); and anti-framing headers on every response. Decided along the way: a Hint links to its whole Chapter; Local-mode Settings holds the theme and Reset progress; the theme lives in a cookie. C10c, the Go and Rust/Java Chapters of dynamic arrays, shipped in `v0.28.0`; the Topic's human source review was skipped at merge and is tracked in #113. Drawn on the boards but without cards: the breadcrumb step indicator, the previous/next arrows and the "In the wild" and "Submissions" tabs. Browser tests run with four parallel workers: Local tests are isolated per Learner, and Multi-user tests that change Instance state start their own server.

## Sprint 4 · Multi-user

**Goal:** one instance serves a group.

- Design: AD1 first-run setup, A1 Sign in (local ± GitHub/Google), A3 Sign up (open registration), A4 Accept invite, AD2 Users page.
- Build: first-run mode choice, Better Auth with local accounts and optional OAuth, open / invite-only registration, admin password reset, per-user progress.

**Exit:** an admin can set up, invite a user, and that user signs in and keeps their own progress.

**Status (2026-10-23):** exit met, checked by a browser test (C40): the admin signs in and creates an Invite; a second browser opens the link and creates an Account; that user reads a Chapter, signs out, signs in again and still sees it read, while the admin sees it unread (on the Topic page, since the Map shows Problem counts only). Built this sprint: the Instance mode stored in the database (C26) and Setup (C28, C31c, C54); Better Auth with local Accounts, sign in, sign out and a sign-in limiter (C29, C31a, C32, C32b); the first admin keeping the Local progress (C31b); open and invite-only registration (C33a to C33d, C34b); Invites (C35a, C35b); one-time passwords (C36a, C36b); removing an Account (C37, C56); GitHub and Google sign-in (C38); switching a Local Instance to Multi-user from Settings (C39); the `reset-admin-password` command (C42a, C42b); a sign-in that can't outlive a password change or reset, with each session bound to its credential generation (C53, C58); every Account keeping its Learner and no Learner outliving its Account (C57); logs that never hold an invite token, through SvelteKit's, Better Auth's and Better Call's error paths and every console member (C35b, C55); the operator docs (C41). Decided along the way: each Account has its own Learner and the Local Learner goes to the first admin; the Instance mode and Registration Mode are cached per process, hence one web process per data volume (ADR 0006); an Invite is claimed before any write, and in Open mode too; the database refuses and removes a removed Learner's progress; a closed sign-up answers the same whether or not the email has an Account, by email or OAuth. Every identity card had a two-reader security review before merge (a Fable advisor and a read-only Codex run on one shared brief); the residuals the maintainer accepted are recorded on the cards and their PRs. The unit tests on file databases still time out or fail to open now and then on CI.

## Sprint 5 · Mobile

**Goal:** everything in MVP1 works on a phone, including writing code.

- Design: P2 Map, P4 Topic, R2 Chapter, P10 Problem (tabs), A2 Sign in.
- Build: those layouts, following the F3 rules already applied since Sprint 2.

**Exit:** Playwright mobile-viewport runs pass for each of those screens; MVP1 as written in `docs/product/mvp1.md` ships as release `v1.0.0`: the last commit of the sprint carries a `Release-As: 1.0.0` footer, so release-please makes it the first major release. Until then every release stays `0.x`.

**Status (2026-10-25):** exit met, checked by the `mobile` Playwright project (C51), which runs on every CI run at 390 x 844 with touch. It walks one flow on each screen: tap a Topic on the Map; tap a Chapter and a Problem row on the Topic; read a Chapter to its end and see it Read on the Topic; on a Problem, type code on the Code tab, Run it (Wrong Answer), submit the Reference Code and reach Accepted, then see the Problem solved on the Topic; sign in on the Multi-user server and be sent to the page asked for, then sign out from Settings. Beside those, the layout tests built with each screen (C45 to C50, C52) run at the same size in the `e2e` and `e2e-multi` projects: one column of Topics, 44 px targets and no sideways scroll, the Chapter's code and tables scrolling inside their own box, the Problem's three tabs, the 56 px phone header, and Sign in's 48 px controls. Built this sprint: the Map (C45), Topic (C46), Chapter (C47), Problem tabs (C48), the app header below 768 px (C49, with F16) and Sign in (C50) as phone layouts, and a language switch that keeps the Code tab (C52), each from its mobile board (P2, P4, R2, P10, A2); the unit tests on file databases stopped flaking on CI (C59). Decided along the way: every phone layout starts at the one breakpoint, `max-width: 767.98px`, so 768 px is a desktop layout; Sign in's old 900 px breakpoint moved to it, so Sign in between 768 and 900 px now uses the desktop layout with the figure; below 768 px the wordmark reads "BLC"; the Read marker is hidden on a phone Chapter, so its test waits for the save instead. Inferred where the boards are silent, and not tested at phone width: Sign in on an invite-only Instance (no sign-up link) and the closed-sign-up notice. Decided by the maintainer (2026-10-25): ship `v1.0.0` with the merge of C51, which carries the `Release-As: 1.0.0` footer. Not claimed: the phone flows run in Chromium at a phone-sized viewport with touch, not on a real device or in WebKit; the Dependabot fix (no `.github/dependabot.yml`, so security updates fail on `bun.lock`) and the SvelteKit 3 upgrade (two low alerts, judged not to apply: no prerendered pages, no root catch-all route) come after 1.0.0.

## Sprint 6 · Hardening

**Goal:** what the reviews after `v1.0.0` found is fixed, the open bugs are closed, and the content still to be written is mapped.

- **From the cloud review of `src/` (2026-10-25):** 20 findings, checked against `v1.0.0` (c656de7) on 2026-10-26. Nineteen hold; nits are grouped by area. The one that didn't reproduce (an admin reset locking out a GitHub/Google-only Account) is pinned by a test instead (C75).
  - Problem: C68 a retried save after a lost reply lands as saved (decided: the Learning core answers an identical save one revision behind as saved), C69 edits typed during an in-flight autosave survive closing the tab, C70 Reveal hint says when it fails.
  - Identity and Account: C71 the theme and invite cookies on plain-http Instances, C72 Change password for an Account with no password, C76 provider sign-ins that complete give their start back, C77 the throttle's address × Account map evicts, C81 each Users action's error next to its control, C74 nits.
  - Learning and Runner: C78 one Build rule for the core and the Runner, C79 the startup sweep and slow creates, C73 and C80 nits. C82 merges duplicated test helpers.
- **Open bugs and follow-ups:** #248 (C61), #250 (C62), #249 (C63), #239 (C64), #232 (C65), #233 (C66) and #240 (C67, SvelteKit 3, last, after every other code card).
- **Found during the sprint (2026-10-26):** C83 makes Docker calls that time out reject on the production Bun, so a stalled call no longer holds a Runner slot for good (#284; runner lane, after C80). C84 reviews and merges the two action majors Dependabot opened in `release.yml` (#275, #276). Later the same day:
  - C88 makes the release gate wait for ci's test jobs only. 1.4.0 shipped tag-only because a newer push cancelled its publish-edge.
  - C89 lands #305's dependency group, with the session-binding tests rewritten for better-auth 1.7.8+'s password changes.
  - C90 bounds every CI job and the browser install. Azure's apt mirror hung three release commits.
  - C92 makes e2e wait for hydration before typing or clicking (#320, which SvelteKit 3 made worse).
  - Filed for later, outside the sprint: C85 (the throttle's Account cap past maxKeys), C86 (a missing image fails the Run instead of pulling inside it), C87 (a create that times out leaves no container), C91 (browser jobs in the Playwright image, with no apt), #313 (the Problem screen's 900–901 px gap) and #325 (a value typed before hydration is cleared).
- **Content coverage:** C60 compares `content/` with the NeetCode roadmap's topic list and files a content issue for each missing Topic, held to `docs/content-standards.md`.

**Exit:** all Sprint 6 cards Done and CI green on `main`; the gap report is on `main` with an open content issue for each missing Topic; Dependabot runs without errors and alerts #1 and #2 are closed. Releases stay `1.x`.

**Status (2026-10-27):** exit met. All 29 Sprint 6 cards are Done and `ci` is green on `main` (3523c0f, then the 1.5.1 release commit). The gap report is `docs/content-coverage.md` (C60), with content issues #252 to #268 open, one per missing Topic. Dependabot runs without errors since C64, and alerts #1 and #2 were fixed by C67's SvelteKit 3 upgrade on 2026-10-26. The last release is `v1.5.1`. Decided along the way: the release gate waits for ci's seven test jobs only (C88); every CI job has a timeout and the browser install is bounded (C90); a release commit whose CI fails only on an infrastructure step is re-run and re-gated by the orchestrator without asking, only while it is `main`'s HEAD (maintainer, 2026-10-26); the build stages run Bun 1.4.3 while the production image stays on Bun 1.2.19, because SvelteKit 3's build exits silently on older Bun (C67); browser tests wait for hydration before typing or clicking (C92). Filed during the sprint and not carded: #307, #313, #325 and #328.

## Sprint 7 · Hardening

**Goal:** the follow-ups filed outside Sprint 6 are closed, and CI no longer installs anything from Azure's apt mirror.

- **Identity:** C85 keeps every Account's cap of 50 tries once the throttle's Account map holds maxKeys (10,000) Accounts (#302). Security review before merge.
- **Runner (one lane, in order):** C86 fails a Run whose image went missing as a Runner error, instead of pulling the image inside the Run while it holds a Run slot; the background loop pulls it again. C87 removes a container whose create timed out on our side but completed in Docker, in the same Run's cleanup. Both came from C83's sandbox review (#312) and get `sandbox-security-reviewer` before merge.
- **CI:** C91 runs the e2e and docker jobs with the browser from Microsoft's Playwright image, pinned by digest, and no apt call. Until it lands, the infrastructure re-run rule above still applies.
- **Found during the sprint (2026-10-27), added to it when filed:** C94 starts each e2e wait for a Chapter's reach-end post before the navigation that sends it (#328; the fixture Chapter's end is in view on load, so the post went out before the wait). C93 caps each background image pull at about 30 minutes and fails it on the first error chunk, from C86's sandbox review, with C87's review follow-ups folded in.

**Exit:** all Sprint 7 cards Done and CI green on `main`; the e2e and docker jobs make no apt-get call. Releases stay `1.x`.

**Status (2026-10-27):** exit met. All six Sprint 7 cards are Done and `ci` is green on `main` (939e83e). Its e2e and docker jobs make no apt-get call: a grep of both job logs finds none. Releases 1.5.2 to 1.5.5 shipped, all `1.x`, with no open Dependabot alerts. Built this sprint: CI's browser steps run in Microsoft's Playwright image, pinned by digest, through `docker run --network host`, with a step that fails when the image and `@playwright/test` versions differ (C91); a Sandbox image that goes missing fails the Run as a Runner error, takes its Language out of the ready set, and is pulled again in the background, so no pull runs inside a Run (C86); a create that times out is cleaned up by its container name in the same Run, within 8 s (C87, bounded in C93); background pulls have a 30-minute cap, fail on the first error chunk, and pending late removes are capped at 64 (C93); the throttle's Account map never evicts or skips, so every Account keeps its cap of 50 however many Accounts are tried (C85); and the reach-end e2e waits no longer race the post (C94). Decided along the way: C85's first design, a count-min sketch for evicted Accounts, was dropped after the second security reader showed that a new Account could inherit a colliding slot's earlier window end (49 tries and then 50 more, where main allows 50). The Account map has no maxKeys bound instead, because only a stored Account's id can key it: its memory is bounded by the real Accounts tried in one window. Filed and not in the sprint: C95 (a malformed image reference fails at start-up instead of pulling every tag; not reachable with today's config).

## Sprint 8 · Content

**Goal:** six more Topics are on `main`, written to `docs/content-standards.md`, each with every link it cites queued for a human check.

- **Ready first, in parallel lanes:** C100 Hash tables (#259), C101 Two pointers (#268), C102 Binary search (#255), C103 Stacks (#265).
- **Then:** C104 Sliding window (#264), after C100 and C101. C105 Linked lists (#262), after C100: its LRU cache Chapter builds on a hash table, as `docs/research/topic-map.md` has it.
- **Each Topic:** every Chapter in its issue's outline, each a reading about one real system and the decision it made, cited inline to primary sources at a pinned version, then its Problems as one Build. The issue's candidate Problems are used where they fit the Build, with statements, examples and tests written fresh.
- **Shared files:** each card adds its id to `content/content.json` and fills only its own section of `docs/research/human-review-queue.md`. Decided by the maintainer (2026-10-27): the cards run in parallel lanes. A worker resolves the one-line `content.json` conflict by keeping every id.

- **Found during the sprint (2026-10-27), added to it when filed:** C106 runs CI's content check concurrently and gives the `sandbox` job 30 minutes, because C104's run hit the old 15-minute limit with seven Topics. C107 runs a Submission's hidden Tests in containers of at most 25. The Sandbox starts a fresh process per Test, about 0.2 s each in TypeScript, so late Problems in long Builds were nearing the 10 s container limit even for correct code (hash-tables-collisions: 44 hidden Tests, about 9 s).

**Exit:** all Sprint 8 cards Done and CI green on `main`; CI's content check Accepts each new Topic's Reference Code in Python, TypeScript and Go; every link each Topic cites is listed in its section of the human review queue. Releases stay `1.x`.

**Status (2026-10-27):** exit met. All eight Sprint 8 cards are Done and `ci` is green on `main` (01fc448). Its content check Accepts every Problem of all seven Topics in Python, TypeScript and Go, in 8:52 of the `sandbox` job's 30 minutes. Six Topics shipped, each Chapter a reading of one real system at a pinned version:

| Topic | Card | Chapters | Problems | Links queued |
|---|---|---|---|---|
| Stacks | C103 (#342) | 4 | 9 | 53 |
| Binary search | C102 (#343) | 4 | 7 | 31 |
| Two pointers | C101 (#344) | 4 | 13 | 34 |
| Hash tables | C100 (#346) | 4 | 9 | 66 |
| Linked lists | C105 (#349) | 5 | 14 | 67 |
| Sliding window | C104 (#350) | 4 | 10 | 33 |

Every link each Topic cites, 284 in all, is listed in its section of the human review queue, unticked. No `[NEEDS SOURCE]` remains. Each PR lists the claims cut for want of a source and the Codex findings fixed in its Problems. Releases 1.6.0 to 1.10.1 shipped, all `1.x`.

Decided along the way:
- The four ready cards ran in parallel lanes after a scaffold PR created the review queue (maintainer).
- Problems that need a map use each Language's built-in one, not the Hash tables Build.
- Linked lists' fourth Chapter reads Linux's `lib/list_debug.c` and links to Two pointers' cycle Chapter instead of repeating it, which departs from the issue's outline (for the maintainer to confirm).
- A Submission's hidden Tests run in containers of at most 25 (maintainer, C107), rather than capping Tests in content or raising the container limit.

Not in the sprint:
- The Hash tables issue's candidate Problems (Two Sum and others) did not fit its Build. They need a card, after a decision on whether they use the Build's table.
- Linked lists' Reorder List is left for a later card.
- C95 (a malformed image reference) and C108 (a Submission meeting a busy Runner between its batches) have no sprint.

## Sprint 9 · Hardening

**Goal:** the two Runner follow-ups from Sprint 8's reviews are closed.

- **C95:** a malformed image reference in the Sandbox config fails at start-up instead of pulling every tag (from C93's sandbox review, #337).
- **C108a:** a Submission survives a busy Runner between its batches. **C108b:** one learner can't have more than a set number of Submits running at once. Both come from C107's sandbox review (#353), split from C108 at Tidy.
- **Lanes:** C95 runs alone. C108a and C108b share `learning/core.ts`, so they run in one lane, in that order. Every card gets `sandbox-security-reviewer` before merge.

**Exit:** all three cards Done and CI green on `main`. Releases stay `1.x`.

**Status (2026-10-27):** exit met. All three Sprint 9 cards are Done and `ci` is green on `main` (48d5e4c). Releases 1.10.2 to 1.10.4 shipped, all `1.x`. Every card had a `sandbox-security-reviewer` pass and a short fix round before merge.

Built:
- **C95 (#358):** a malformed Sandbox image reference is checked against Docker's reference grammar and stops the Runner at start-up (exit 1), instead of pulling every tag or retrying forever. Every reference valid before parses to the same query; the review fuzzed 300,000 strings against the old parser.
- **C108a (#359):** the Runner keeps a bounded first-in-first-out queue (8 waiters, 8 s each) in front of its slots, so a Submission's later batch waits for a slot instead of failing. A waiter whose caller has gone, or whose Language left the ready set, is released without running. The review stress-tested the handler with about 3,650 racing requests per run: no slot leaked or was granted twice.
- **C108b (#361):** one Learner has at most 2 Runs and Submits running, counted together and refused as `RunnerUnavailable` after the save. A place always frees, at the latest after a 100 s ceiling, so a stalled reply can't lock a Learner out until a restart.

Decided along the way:
- C108 was split at Tidy into C108a and C108b. The orchestrator widened C108b's cap to count Runs as well as Submits, after C108a's review.
- C95 also took `sandbox.ts` and `main.ts`, so that a bad image fails at start-up rather than in the pull loop.
- The cap of 2 is every Runner slot on a 2-CPU box. C108a's first-in-first-out hand-off is what keeps one Learner from starving others.

Not in the sprint:
- C109: the operator docs should ask for a reverse-proxy read timeout of at least about 100 s, since a Submit can take up to 90 s and nginx defaults to 60 s.
- C110: a deadline on a late remove's "in progress" poll.
- Several Accounts per person on an open-registration Instance can still fill every slot and queue place. A web-wide cap or invite-only registration covers it.

## Sprint 10 · Hardening

**Goal:** the two follow-ups from Sprint 9's reviews are closed.

- **C109:** the operator docs say a reverse proxy in front of the Instance needs a read timeout of at least about 100 s, since a Submit can take up to 90 s and nginx defaults to 60 s (from C108a's sandbox review, #359).
- **C110:** a late remove whose "already in progress" poll outlasts one overall deadline gives up and frees its late-remove slot (from C93's and C95's sandbox reviews, #337 and #358).
- **Lanes:** the two cards edit different files, so they run in parallel. C110 gets `sandbox-security-reviewer` before merge.

**Exit:** both cards Done and CI green on `main`. Releases stay `1.x`.

**Status (2026-10-27):** exit met. Both Sprint 10 cards are Done, and `ci` is green on `main` (94f2b0c). Release 1.10.5 shipped.

- **C109 (#366):** the README's operator notes say a reverse proxy needs a read timeout of at least about 100 s, because a Submit can take up to 90 s. nginx's default of 60 s is cited from nginx's own documentation, with `proxy_read_timeout 120s;` as the example.
- **C110 (#367):** a late remove that gets 409 "removal already in progress" gives up after one 15 s deadline, measured on a monotonic clock, and frees its late-remove slot. Before, it could poll for up to about 12.6 minutes. The sandbox review probed it under Bun 1.2.19 with seven kinds of stalled daemon, and CI's Bun 1.2.19 check now covers the poll path.

Decided along the way:
- C110's cosmetic log at sandbox.ts:291 became an optional note at Tidy, so the card kept one Done-when line. It wasn't done.
- C110 took engine.bun-check.ts for its Bun 1.2.19 check.

Known and accepted:
- On a degraded Docker daemon that answers fast but reports "in progress" for ever, a Run's cleanup can take about 27.6 s, so the learner may get "try again".

Not in the sprint:
- C111 (filed while checking C109's sources) should make one constant cap the Runner calls a Submission may make. The place ceiling, the README and the module map all assume three calls, and nothing enforces it today.

## Sprint 11 · Hardening

**Goal:** what a Submission may cost the Runner is set in one place and enforced on content.

- **C111:** one config constant gives the most Runner calls a Submission may make. C108b's place ceiling is derived from it, and the loader refuses content whose Submission would need more calls, naming the Problem. Today's content needs at most 3, and the README's proxy note (C109) assumes 3. Sandbox review before merge.

**Exit:** C111 Done and CI green on `main`. Releases stay `1.x`.

**Status (2026-10-27):** exit met. C111 is Done, `ci` is green on `main` (13716f6), and release 1.10.6 shipped.

- **C111 (#371):** `maxSubmitCalls = 3` in runner/config.ts is now the one place that sets how many Runner calls a Submission may make.
  - C108b's per-Learner ceiling is derived from it: `maxSubmitCalls × adapterTimeoutMs + 10 s` = 100 s, unchanged.
  - The `queueWaitMs` and `maxRunsPerLearner` comments refer to it.
  - A note next to it says the README's reverse-proxy timeout (C109) assumes the same number.
  - The loader refuses content whose Submission would need more calls, naming the Problem. So over-limit content stops the server at start-up.
- **Verified:** today's 69 Problems load, 43 at 2 calls and 26 at 3. The sandbox review checked the boundary: with 47 added Tests a Problem loads at 3 calls, and with 48 it is refused at 4.

For content authors: hash-tables-collisions already uses 44 of the 50 hidden Tests one Submit can carry (two batches of 25). Adding 7 or more hidden Tests to an earlier Core Problem in that Topic would be refused when the server starts.

## Sprint 12 · Content

**Goal:** the eleven roadmap Topics `docs/content-coverage.md` still lists as missing are on `main`, written to `docs/content-standards.md`, each with every link it cites queued for a human check. Five quotes in shipped Chapters match the sources they cite.

- **First:** C112 checks five quotes in shipped Chapters against their cited sources at the pinned version, and fixes the citation, rewords or removes each one that doesn't match.
- **Topics, in prerequisite order.** Each card is blocked by the cards for its Prerequisites, taken from its issue:
  - Ready first, beside C112: C113 Trees (#266), C122 Math and geometry (#263), C123 Bit manipulation (#256).
  - After Trees: C114 Heaps (#260), C115 Tries (#267), C116 Backtracking (#254).
  - After Heaps: C117 Graphs (#257) and C118 Greedy (#258). After Backtracking: C120 1-D dynamic programming (#252).
  - Last: C119 Intervals (#261), after Greedy, since #261 lists Greedy as a Prerequisite; and C121 2-D dynamic programming (#253), after C120.
- **Beside the hardening session** (decided by the maintainer, 2026-10-28, as in Sprint 8): a second orchestrator works this sprint from its own clone while the first keeps hardening and infra. Its cards touch only `content/` and the content docs, never `src/`, CI or release files. Its codes are C112 to C123.
- **Links:** as in Sprint 8. Agents fetch every source and check each quote, but never claim that a human opened a link. Every cited link is in its PR's checklist and in its Topic's section of `docs/research/human-review-queue.md`, and a Topic merges with that review still pending. CI must be green; nothing merges past a failing check.
- **One Submit's limit** (C111): a Submission makes at most 3 Runner calls, so the hidden batches of a Problem's Submit hold at most 50 Tests: every earlier Core Problem's Tests plus its own hidden ones. The loader refuses content past that, naming the Problem. Each Build plans its Tests to fit.
- **Shared files:** each card adds its id to `content/content.json` and fills only its own section of the review queue, which this sprint's setup created empty. A lane that conflicts in `content.json` keeps every id.
- **Watch:** CI's `sandbox` job ran the content check for seven Topics in about 6.5 of its 30 minutes. Eighteen should fit. A lane whose run nears the limit reports it, and the timeout is the hardening session's to change.

**Exit:** all twelve cards Done and CI green on `main`; CI's content check Accepts each new Topic's Reference Code in Python, TypeScript and Go; every link each Topic cites is listed in its section of the review queue; `docs/content-coverage.md` lists the Topics shipped. Releases stay `1.x`.

**Status (2026-10-28):** exit met. All twelve Sprint 12 cards are Done, and `ci` is green on `main` (bd27323). Its content check Accepts every Problem of all 18 Topics in Python, TypeScript and Go, in 13 minutes 6 seconds of the `sandbox` job's 30 minutes. Eleven Topics shipped, each Chapter a reading of one real system at a pinned version:

| Topic | Card (PR) | Chapters | Problems (core + extra) | Largest Submit (of 50) | Links queued |
|---|---|---|---|---|---|
| Math and geometry | C122 (#378) | 4 | 8 + 4 | 33 | 53 |
| Bit manipulation | C123 (#376) | 4 | 10 + 2 | 39 | 35 |
| Trees | C113 (#379) | 5 | 9 + 2 | 41 | 61 |
| Backtracking | C116 (#382) | 5 | 6 + 4 | 40 | 74 |
| Tries | C115 (#383) | 4 | 6 + 2 | 44 | 75 |
| Heaps | C114 (#384) | 5 | 7 + 2 | 43 | 68 |
| 1-D dynamic programming | C120 (#386) | 4 | 6 + 3 | 43 | 55 |
| Greedy | C118 (#390) | 4 | 4 + 2 | 39 | 67 |
| 2-D dynamic programming | C121 (#389) | 4 | 5 + 5 | 41 | 77 |
| Graphs | C117 (#391) | 5 | 10 + 4 | 39 | 90 |
| Intervals | C119 (#393) | 4 | 4 + 3 | 43 | 69 |

That is 48 Chapters and 108 Problems. All 724 queue lines are unticked, and no `[NEEDS SOURCE]` ships. Each PR lists the claims it cut for want of a source and the Codex findings it fixed. Releases 1.10.7 to 1.18.0 shipped, all `1.x`.

C112 (#375) checked the five shipped quotes against their sources at the pinned version:
- "are their own hash codes" was re-cited to `Objects/dictobject.c` lines 306 to 307.
- "hits, misses, maxsize and currsize" was re-cited to `Doc/library/functools.rst` lines 204 to 205.
- The Emacs circular-list quote and the fail2ban `findtime` quotes were confirmed, with their ranges narrowed and the dropped Texinfo and roff markup noted.
- The `String.hashCode` quote got back its last clause, "and `^` indicates exponentiation": in Java `^` is XOR, so the cut changed the meaning.

Decided along the way:
- Intervals followed Greedy, because #261 lists Greedy as a Prerequisite (orchestrator, from the issue).
- Codes started at C112, after the hardening session's C111.
- Workers stopped at green CI. Before each merge the orchestrator checked every quote against the source fetched at its pinned version.
  - That check led to two fixes before merge: in C123 the RAID 6 comment quote is now linked to its own line (`raid5.c` line 1715); in C115 the `rax.h` example strings are cited at lines 36 to 41.
  - For C116 it checked the Knuth quotes against the paper's arXiv TeX source.
- Every brief after round 1 required each quote's link in the quote's own paragraph, with markup dropped only as rendered and recorded in the sources file.
- Workers merged `main` into their branches instead of rebasing, because force-push is not allowed. Each `content/content.json` conflict kept every id.
- The content check ran locally with `SANDBOX_CONCURRENCY=1`. At 4 on the shared 2-CPU host, TypeScript Problems with 20 or more hidden Tests got false Time Limit Exceeded verdicts. CI ran at its own setting.
- Where a Topic built on an earlier one, the later brief named what was taken:
  - 2-D dynamic programming links to `dp-1d-git` instead of reading git's `levenshtein.c` again, and reads PostgreSQL's two-row version.
  - Intervals was offered earliest-finish scheduling, which Greedy had no source for. It found none either.

Outline entries that became sections, not Chapters:
- Tries: array-versus-map children is part of the Go `ServeMux` Chapter.
- Graphs: depth-first search is part of the lockdep Chapter.
- Heaps: the two-heap median is an Extra Problem with no system claim.
- Intervals: meeting rooms with a heap is part of the e820 Chapter, and a memblock Chapter was added to carry Insert Interval.
- Greedy: its interval-scheduling half was dropped for want of a source.

Candidate Problems left out, each for want of a real system that frames it or a fit with the Build (reasons in each PR):
- Heaps: Last Stone Weight, K Closest Points to Origin, Task Scheduler.
- Tries: Word Search II.
- Graphs: Clone Graph, Rotting Oranges, Word Ladder.
- Greedy: Maximum Subarray, Gas Station, Hand of Straights, Partition Labels.
- Intervals: Non-overlapping Intervals.
- 1-D dynamic programming: Longest Increasing Subsequence.
- 2-D dynamic programming: Unique Paths.
- Math and geometry: Happy Number.

Not in the sprint:
- Every new link waits for its human check in the review queue. Two Topics also rest on a PDF:
  - Two pointers quotes Brent's 1980 abstract.
  - Backtracking quotes Knuth's "Dancing Links". The worker checked it against text extracted from the PDF, and the orchestrator against the paper's arXiv TeX source.
- C131 (filed by the hardening session): `escape.sandbox.test.ts` "ends a bomb that forks without bound" ran 16.5 s against its 15 s bound once, on #376. Its fix allows for Docker's create latency.
- The shared GitHub GraphQL quota ran out once and held the merges for about 35 minutes. Every worker's `gh pr checks --watch` counts against it.

## Sprint 13 · Foundations

**Goal:** the project has a logo and a README a newcomer can follow end to end. A sprint-planner agent keeps sprints and cards small. Releases are cut by the orchestrator, by hand, once a planned feature set is complete.

- **Three tracks, eight cards.** The maintainer planned them on 2026-10-28 and held them until Sprint 12 was Done.
  - **Brand and README:**
    - F17 designs the logo on the canvas's Foundations page: three directions in light and dark, each checked at 16, 32 and 200 px. The orchestrator picks one.
    - C124 exports it to `docs/assets/` and the app favicon.
    - C125 captures screenshots with Playwright.
    - C126 rewrites README.md on top of both. It adds a Topics table generated from `content/` and a quick start that is run for real.
  - **Planning:** C127 adds the `sprint-planner` agent and calls it from `/orchestrate`.
  - **Releases:**
    - C128 stops `release.yml` merging release PRs, and adds `docs/releasing.md`.
    - C129 gives every commit type its own changelog heading, and adds a release-notes template.
    - C130 sets which commit type a card PR uses, and adds a `Changelog:` line to every card PR.
- **Order.** Round 1 runs four lanes: F17; C125; C127 then C130; and C128 then C129. C124 follows the orchestrator's pick on F17. C126 follows C124 and C125.
- **Shared files:**
  - `docs/agents/board.md` is a chain: C127, then C130.
  - `docs/releasing.md` is a chain: C128, then C129.
  - In `docs/assets/`, C124 and C125 write separate files, and C126 reads both.
- **No version jumps on the way.** C128 lands before any card that bumps the version. Only C124 is `feat`, because the favicon is user-visible. Every other card is `docs` or `ci`, and F17, a design card, opens no PR.
- **Release field.** The board's new Release field groups cards into releases. `R next: Foundations` (`5eb8b28c`) holds all eight cards. The target is 1.19.0, the next minor after 1.18.0, the last automatic release.
- **The cut:**
  - The card that completes the feature set carries `Release-As: 1.19.0`.
  - The orchestrator runs the checks in `docs/releasing.md` and merges the release PR. It then watches the tag, release-gate, publish-release and the webhook.
  - This is the first release PR merged by hand. It also checks that publishing and the webhook still run after a manual merge.
- **Off `content/`.** No card in this sprint edits content. The README's Topics table only reads it.

**Exit:**
- All eight cards are Done, and `ci` is green on `main`.
- README.md shows the logo, the badges, a Topics table that matches `content/`, and a quick start that its PR ran end to end.
- `/orchestrate` calls the sprint-planner when a sprint starts.
- `release.yml` leaves release PRs open.
- The orchestrator cuts 1.19.0 from the release PR. Its images are published, the webhook runs, and the cut is recorded in `docs/releasing.md`.
- Releases stay `1.x`.

**Not in the sprint:** C131, the bound on the fork-bomb test, waits for the maintainer to place it.

## After each build sprint

Code cards for Sprints 2–5 come from the spec via `to-tickets` when the sprint starts. When a sprint's features land, `improve-codebase-architecture` turns friction into `architecture` issues for later.
