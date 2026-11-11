# Sprints archive

Exited sprints, moved here from `docs/sprints.md` once each sprint's release was cut (the maintainer's rule, 2026-11-10). Each section keeps its plan and its Status as they were written. `docs/sprints.md` holds only the current and planned sprints.

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

**Status (2026-10-28):** exit met.
- **Cards:** all eight Sprint 13 cards are Done.
- **CI:** `ci` is green on `main` at the completing commit (65e6080) and at the release commit (13cbdf5).
- **Release:** the orchestrator cut 1.19.0 from release PR #403, the first release merged by hand. The merge's own `release` run did all of it, and the cut is recorded in `docs/releasing.md`:
  - it tagged `v1.19.0` and passed `release-gate`;
  - it published the image as `v1.19.0` and `latest`, under one digest;
  - the webhook answered `delivered`.

| Card | PR | What landed |
|---|---|---|
| F17 | canvas v55 | The Logo artboard on the Foundations page: three directions in light and dark, each checked at 16, 32 and 200 px. |
| C124 | #401 | Direction B exported to `docs/assets/` (mark and lockup, light and dark, wordmark outlined) and as the app favicon. |
| C125 | #400 | README screenshots captured by Playwright with one command, kept out of `test:e2e` and CI. |
| C126 | #404 | README rewrite: logo, badges, pitch, screenshots, a quick start run for real, a generated Topics table, repo map, contributing. Operator sections moved unchanged to `docs/self-hosting.md`. |
| C127 | #399 | The `sprint-planner` agent, called by `/orchestrate` at a sprint's start and on a too-big card. |
| C128 | #398 | `release.yml` no longer merges release PRs. `docs/releasing.md` holds the Releases and the cut steps. |
| C129 | #402 | Every commit type has its own changelog heading. Release notes come from the template. |
| C130 | #405 | Commit types and a `Changelog:` line on every card PR, plus the PR template. |

Decided along the way:
- **Logo:** the orchestrator picked direction B after rendering all three marks at real size. At 16 px, B's bracket bars sat between pixels, so the designer moved them from y 3 and 29 to y 4 and 28 on the canvas. C124 copied the result.
- **Stop at green CI:** C124, C126, C127, C128, C129 and C130 stopped there for the orchestrator's review. C124, the only `feat`, merged only after C128, so no release shipped by itself on the way.
- **C127's dry run:**
  - The planner, dry-run on a sample "Sprint 14 · Test reliability" goal, passed its eight checks and reported where its definition was unclear.
  - Eleven fixes went in before the merge: Releases follow release-please and are cut in order, and a card never has `Release: none`; the order of filing, with an undo; pulling in existing cards; codes for split children; never padding a sprint; flagging security reviews; about six rounds; the plan PR's own conflicts; comparing the whole option list; cheap re-reads; one observable `Done when`.
- **Changelog lines:** `CHANGELOG.md` keeps release-please's headings. Each card's `Changelog:` line reaches a release through the notes template, set with `gh release edit` after the tag. release-please never edits a release it created.
- **Quick start:** C126's first run used this host's stale cached `latest` (v0.43.0). It was re-run on `v1.18.0`, which had the same digest as `latest`. `init` pins its own version in `.env`.

For the maintainer:
- **Content commit types:** C130 records the orchestrator's reading that a Chapter or Problem added to a Topic that has already shipped is `feat`. Confirm or correct it.
- **Next sprint:** C131 is still unsprinted. The planner's dry run left a candidate Sprint 14 · Test reliability: C131; a one-time re-run of content-check cases on a Runner error; per-checkout e2e ports; content-check jobs in parallel to `sandbox`; and the content check's concurrency on this host. It has two open questions: should the Runner retry Docker calls in production, and how are retries measured?
- **Preview Instance:** `blc-preview` on this host runs v0.43.0 from a stale local `latest`. It was left untouched.

## Sprint 14 · Identity

**Goal:** Identity is cut along its seams, so its cards stop colliding in one file and can run in parallel lanes. The cuts are one fast Better Auth test harness, a logging module, a session-binding module with one `currentSession`, account actions that the routes call instead of Better Auth, and one route-policy table for the gate and the response headers. Each security rule gets one definition, and a data request's gate redirect keeps the anti-framing headers.

Release `R v1.19.1: Sprint 14 · Identity`, version 1.19.1 (patch, because no card is `feat`: nothing changes for a learner on any screen).

- **Seven issues, checked against `main` at a7a83c6.** Six come from the architecture reviews after Sprints 4 and 5: #231 (test harness), #227 (auth.ts is nine modules), #228 (session rules in five places), #229 (eight rules written twice), #230 (adapter choice and route policy) and #226 (routes reach into Better Auth). The seventh is #172 (data redirects lose the anti-framing headers), which #230 places in the same step.
- **Already on `main`, so no card for it:**
  - #231: C59 (#235) copies a template database migrated once per worker, waits 10 s on a lock, and closes every client before removing the directory. C43b (#192) gave the Multi-user fixture a 10 s busy timeout and a retry.
  - #226: C74 (#310) made one `clientAddress` and took the password minimum hint from `MIN_PASSWORD_LENGTH`.
  - #229: C74 (#310) made one ORIGIN parser, `parseOrigin`.
  - #230's comment: C63 gave Accept invite the bare header (#249).
- **Four lanes, one card each per round.** The harness, the logging module, the route-policy table and the Local Learner id start the sprint side by side. Every later Identity card then runs on the fast harness.

  | Round | A · Auth core | B · Logging and account actions | C · Request step | D · Tests and routes |
  |---|---|---|---|---|
  | 1 | C132 test harness, fast hasher | C133 logging module | C134 route-policy table, gate | C135 one Local Learner id |
  | 2 | C137 callers use logging | C136 `currentSession` | C138 `createIdentity` | C139 Identity tests on the harness |
  | 3 | C141 generation to session binding | C140 account actions | C142 headers from the table | C143 route tests on the harness |
  | 4 | C144 adapter and Users checks via `currentSession` | C146 Sign up, Accept invite | C147 data redirects keep headers | C145 Sign in |
  | 5 | C148 one secret check | C150 Setup | C151 Users logs | C149 Change password, Sign out |
  | 6 | C152 account creation; `createAuth` is wiring only | C154 one class-name rule | C153 one Multi-user object in Locals | |
  | 7 | C155 exit check and `Release-As` (the orchestrator) | | | |

- **Shared files.** Each is an ordered chain, and each later card is blocked by the one before it:
  - `identity/auth.ts` and `auth.test.ts`: C132, C137, C141, C148, C152.
  - `identity/session-binding.ts` and its test (new in C136): C136, C141, C144.
  - `lib/server/app.ts`: C138, C140, C144, C148.
  - `src/app.d.ts`: C138, C140, C153.
  - `lib/server/handle.ts` and `handle.test.ts`: C138, C142, C147, C153.
  - `identity/gate.ts`: C134, C152.
  - `lib/server/logging.ts` and its test (new in C133): C133, C154.
  - `identity/account-actions.ts` (new in C140): C140, C152.
  - `identity/index.ts`: C135, C138.
  - `identity/multi-user.ts`: C135, C144.
  - `multi-user.test.ts` and `accounts.test.ts`: C139, C144.
  - `identity/setup.ts`: C135, C150.
  - `identity/setup.test.ts`: C139, C150.
  - `invite/[token]/accept.ts`: C137, C146.
  - `users/+page.server.ts`: C151, C153.
  - `users.test.ts`: C143, C151, C153.
  - The other route tests: C143 first, then the card that rewrites that route (C145, C146 or C149).
- **What closes what:**
  - C143 closes #231, C142 closes #230 and C147 closes #172.
  - C149 closes #228: once Change password and Sign out go through the account actions, nothing outside session binding reads Better Auth's session.
  - C152 closes #227 and #229.
  - C153 closes #226.
- **For Sprint 15:** C134's table marks /setup, /signin, /signup and /invite/[token] `bare`. #246 reads `bare` from that table and drops the layout's own BARE list.
- **Reviews.** Every card except C139, C143 and C155 changes where an Identity, gate, header, session, secret or log rule lives. Those 21 cards stop at green CI, and the orchestrator runs its two-reader security review (Fable and Codex) before each merge. No card touches the Runner, its container flags or the Docker socket, so none needs `sandbox-security-reviewer`.
- **Waiting on the maintainer.** Two cards are written for the recommended answer, and neither runs until the maintainer answers:
  - C147 (#172): should the hook answer a data request's gate redirect in SvelteKit's own JSON redirect form, so the response keeps the anti-framing headers? The alternative is closing #172 as accepted. Recommended: the JSON form, pinned by an e2e.
  - C154 (#229): which of the two class-name rules for logs is the one rule? Recommended: the stricter one, `^[A-Za-z][A-Za-z0-9]{0,39}$`.
- **Interfaces.** The cards fix the names and shapes the issues' Directions leave to the build: `createTestAuth`, `LogPatterns`, `RoutePolicy`, `createIdentity`'s answer, `currentSession` and the account actions. Workers build to them and decide nothing.
- **Off the screens.** No card changes what a learner or an admin sees. Every route keeps its texts, and each route's e2e passes unchanged.

**Exit:**
- All 24 cards are Done, and `ci` is green on `main`.
- `src/lib/server/identity/auth.ts` is under 400 lines, and `grep -cE 'installLogRedaction|currentGeneration|nameRefusal' src/lib/server/identity/auth.ts` prints 0.
- `grep -rn 'getSession(' src --include=*.ts | grep -v '\.test\.ts'` lists only `session-binding.ts`.
- No route reaches into Better Auth: `grep -rnE 'locals\.(auth|invites|deleteLearner)|\.api\.|\$context' src/routes --include=*.ts | grep -vE '\.test\.ts|e2e|multi-fixture'` prints nothing.
- No route logs on its own: `grep -rn 'console.error' src/routes --include=*.ts | grep -vE '\.test\.ts|e2e'` prints nothing.
- No test keeps its own copy of the secret: `grep -rl 'test-secret-test-secret' src` prints nothing.
- Neither handle.ts nor gate.ts keeps a route list of its own: `grep -nE "route\.id ===|startsWith\('/invite/'\)" src/lib/server/handle.ts src/lib/server/identity/gate.ts` prints nothing.
- On the Multi-user server, the `/settings/__data.json` redirect carries `frame-ancestors 'none'` (signin.multi.e2e.ts, in CI's e2e job).
- `gh issue view` shows #226, #227, #228, #229, #230, #231 and #172 closed.
- The orchestrator cuts 1.19.1 from the release PR and records the cut in `docs/releasing.md`. Releases stay `1.x`.

**Status (2026-11-04):** exit met.
- **Cards:** all 26 Sprint 14 cards are Done. The planned 24 grew by two, both in Release 1.19.1:
  - C197, filed after C137's merge left two of `auth.ts`'s new imports out of the image;
  - C202, the maintainer's card for `notify.yml`.

  C131 joined the sprint and went back to Sprint 16 unmerged, with C201 filed for it (see below).
- **CI:** `ci` is green on `main` at ad0ecaa, the last card's merge.
- **Checks:**
  - `auth.ts` is 324 lines, and its grep prints 0.
  - `getSession(` appears only in `session-binding.ts`.
  - The route greps for Better Auth, `console.error`, the test secret and route lists print nothing.
  - signin.multi.e2e.ts asserts `frame-ancestors 'none'` and `X-Frame-Options: DENY` on the `/settings/__data.json` redirect.
  - #226, #227, #228, #229, #230, #231 and #172 are closed.
- **Release:** this card's merge carries `Release-As: 1.19.1`. The orchestrator then cuts 1.19.1 from the release PR and records the cut in `docs/releasing.md`.
- **Reviews:** 22 cards had the two-reader security review (Fable and Codex) before merge: the 21 planned, plus C202. C197 is a test of the image's file list and had none. Several went back to their workers before merge, among them:
  - C137: two of `auth.ts`'s new imports were missing from the image.
  - C140: closed or invalid sign-up attempts were not charged to the throttle.
  - C145: a provider's refusal answered 500 instead of 400, and a test had lost coverage.
  - C146: tests that had lost coverage.
  - C148: the secret check's message order.
  - C202: a fork branch named `main` could pass the `workflow_run` filter, and signing failures were silent.

| Card | PR | What landed |
|---|---|---|
| C132 | #411 | One Better Auth test harness (`createTestAuth`) with a fast hasher. |
| C133 | #412 | `src/lib/server/logging.ts`: the redaction engine, the console patcher, `formatServerError` and `logFailure`, outside Identity. |
| C134 | #410 | One route-policy table that the gate reads. |
| C135 | #413 | One Local Learner id. |
| C136 | #414 | One `currentSession` that applies every session rule. |
| C137 | #416 | auth.ts and the hook use the logging module; Invites owns the invite patterns. |
| C138 | #417 | `createIdentity` chooses the adapter, and the hook asks it once. |
| C139 | #415 | Identity tests on the harness; test databases skip fsync. |
| C140 | #423 | The account actions: one interface for signing in, signing up, changing a password and signing out. |
| C141 | #421 | The credential generation moves from `createAuth` to session binding. |
| C142 | #418 | Response headers come from the route-policy table. |
| C143 | #419 | Route tests on the harness. |
| C144 | #424 | The Multi-user adapter and the Users page checks read `currentSession`; the sweep joins session binding. |
| C145 | #427 | Sign in signs in through the account actions. |
| C146 | #426 | Sign up and Accept invite sign up through the account actions. |
| C147 | #438 | A data request's gate redirect is answered in SvelteKit's JSON form, through `finish`, so it keeps the anti-framing headers and an extended session's cookie. |
| C148 | #428 | One check for Better Auth's secret (`secret.ts`). |
| C149 | #429 | Change password and Sign out go through the account actions. |
| C150 | #425 | Setup uses the shared refusal map and limits, and logs failures by kind only. |
| C151 | #422 | The Users page logs failures by kind only. |
| C152 | #431 | Account creation leaves `createAuth`, which is wiring only. |
| C153 | #430 | Locals carries one `multiUser` object; no route holds Better Auth's instance. |
| C154 | #436 | One class-name rule for logs, and `name` and `code` read once, inside a guard that never throws. |
| C155 | this PR | Exit check and `Release-As: 1.19.1`. |
| C197 | #420 | A test that every module the image runs from source is copied into it. |
| C202 | #437 | `.github/workflows/notify.yml`: one signed POST to the maintainer's Hermes host per push, merged PR, issue opened or closed, failed `ci` run on main, and a 30-minute tick. |

Decided along the way:
- **The maintainer's two questions:** the maintainer asked the orchestrator on 2026-11-04 to take the recommended option on any question that is not a hard call. Both are recorded on their cards and issues:
  - #172: the JSON redirect form;
  - #229: the stricter rule, `^[A-Za-z][A-Za-z0-9]{0,39}$`. An attacker-chosen name that fits the rule still prints; that is accepted.
- **Chain order:** the `handle.ts` chain ran C138, C142, C153, C147, so C153 did not wait on the #172 question.
- **C131:** the `sandbox-security-reviewer` failed widening the fork-bomb test's bound (#435, closed unmerged). The overrun is in the container's teardown, not its creation, and a wider bound would hide it.
  - C131 went back to Sprint 16, re-specified to time the container's own lifetime.
  - C201 (Sprint 16) investigates where the teardown time goes.
- **C202's fork PRs:** a merged fork PR's run gets no secrets, so it sends no `pull_request` line. That is accepted; the merge's push still notifies.
- **GraphQL budget:** the orchestrator, its workers and `RELEASE_PAT` share one account's GraphQL limit. Polling bursts failed release-please on main twice (runs 40842014062 and 41415985305); both passed on a re-run. CI is now watched over REST, and C200 (Sprint 15) makes release-please try once more after a rate-limit failure.

For the maintainer:
- **GitGuardian:** incidents 39252375 (the test harness's hasher) and 39260283 (a `password:` key in `setup/+page.server.ts`) are false positives. They reappear on merge commits from update-branch. Please mark them.
- **The fork-bomb overrun** (C201) still flakes `sandbox` now and then. A re-run passes.

**Not in the sprint:**
- sign-in.ts's `AUTH_PAGES` (the pages a sign-in never returns to) stays a list of pathnames. #230's Direction names only the gate and the header step as readers of the table.
- The layout's `BARE` list stays until Sprint 15's #246.
- The C58 migration keeps its own copy of the password-Account selector, because it is applied history.
- Better Auth's provider config and the disabled-path lists stay in auth.ts as `createAuth`'s wiring.
- The one control-and-bidi class keeps today's rules: a name may hold U+2028 and U+2029, and only log lines drop them.
- C131, the bound on the fork-bomb test, goes to Sprint 16 with the other sandbox tests.

## Sprint 15 · Screens and phones

**Goal:** every screen draws its phone layout through one seam each: one breakpoint that a test holds, F3's sizes as tokens, one app header, one view of the Problem screen's tabs, Markdown scroll boxes from the renderer, and phone tests written from one module. On the way, the screen bugs #313, #241 and #325 are fixed.

**Release `R v1.19.2: Sprint 15 · Screens and phones`, version 1.19.2** (patch because no card is `feat`: the bug and accessibility fixes are `fix`, the seams `refactor`, the test work `test`).

- **Eight issues, from the architecture reviews after Sprints 3 and 5 and from Sprint 6.** All were checked against `main` at a7a83c6 on 2026-10-29, and all still hold. Some parts are already done, and some have grown:
  - #244: C62 (#299) changed the Problem screen's `767px` queries to `767.98px`. That leaves four widths, not six: 767.98, 800, 900 and 901 px, in 21 queries across 14 files.
  - #246: C63 (#281) added `/invite/[token]` to the header's bare list. It is still a third list of signed-out pages, beside the gate's `isPublic` and Sign in's `AUTH_PAGES`.
  - #245 has grown. C61 added a tagged test in problem.e2e.ts, so there are now six `@mobile` tests and twelve phone describes, and a phone is still written out 16 times.
  - #247 has grown. All 177 shipped Problem statements have code fences, 173 have tables, and none gets a named scroll box.
- **Lanes.** There are six lanes, by file, and the orchestrator runs about four at once:
  - **Problem screen:** C156 (#313) and C157 (#134) run side by side. Then C162, then C166 (closes #134), then C174 (closes #247).
  - **Header:** C161 needs C134, Sprint 14's route-policy table (#230). Then C167, which also waits for C162 and closes #246. Then C173, which closes #241.
  - **Reading:** C159, then C164, then C168, then C175, which closes #244.
  - **Styles and Map:** C158 adds the tokens that every screen card reads. Then C163, and C171 after C156 and C165.
  - **Account forms:** C165, then C169, then C172, which closes #325.
  - **Phone tests:** C160, then C170 (after C164), then C176, which closes #245.
  - **Last:** C177 checks the exit and sets the version.
- **Shared files.** Each is an ordered chain, planned now:
  - `problems/[problemId]/+page.svelte`: C156, then C162, then C166, then C174.
  - `ProblemWorkspace.svelte`: C156, then C162, then C167. `ResultsPanel.svelte`: C156, then C162.
  - `view.ts` and `view.test.ts`: C157, then C162. `HintsTab.svelte` and `SolutionTab.svelte`: C166, then C174.
  - `problems/[problemId]/breakpoints.test.ts`: C156, then C171, which moves it to `src/lib/styles/`.
  - `src/lib/server/header.ts`, `header.test.ts` and `+layout.svelte`: C161, then C167. `AppHeader.svelte`: C161, then C167, then C173.
  - `chapters/[chapterId]/+page.svelte`: C164, then C168. `chapter.e2e.ts`: C164, then C170.
  - `ProblemTable.svelte`: C168, then C175. `topic.e2e.ts` and `problem.e2e.ts`: C170, then C175.
  - The Sign in, Sign up and Accept invite pages, and the new `account-forms.multi.e2e.ts`: C165, then C169.
  - The other new e2e files each belong to one card: `wordmark.e2e.ts` (C173) and `problems/prose.e2e.ts` (C174).
- **Waiting on the maintainer.** Five questions hold five cards, and each card is written for the recommended answer:
  - C171 waits for two #244 questions: a new dependency (recommended: none), and Setup's 900 px and the 800 px screens (recommended: they stay).
  - C160 waits for #245's touch question (recommended: with touch). C170, C173, C174 and C176 use its `phone` setting, so they wait too.
  - C169 and C172 wait for #325's option (recommended: option 2 for typed fields, option 1 for the Problem tabs).
  - C175 waits for #244's shared Problem row (recommended: restyle one table, as the Chapter does).
- **No visible change, except in these cards:**
  - C156: the 900 to 901 px gap.
  - C159 and C174: named code and table boxes on the Problem screen, reachable by keyboard.
  - C165: Sign up and Accept invite between 768 and 900 px, following Sprint 5's rule.
  - C169 and C172: typed values are kept.
  - C173: the wordmark link's name.
  - Every other card keeps each screen as its board shows it, and its Done when names the tests that pass unchanged.
- **Reviews: none.** No card touches the Runner, the container flags or the Docker socket. None changes a security rule or a response header: C161 reads Identity and the route-policy table and changes neither.
- **Rounds.** The longest chains are four cards (C158, C161, C167, C173 is one). Add the last card and the cut, and the sprint takes six rounds. With 21 work cards and about four lanes at once, expect six to seven.

**Exit:**
- All 22 cards are Done, and `ci` is green on `main`.
- `bunx vitest run breakpoints` passes. Every `@media` in `src/` is a query named in `src/lib/styles/breakpoints.ts`, used only in the files it is tied to, and `grep -rn 901px src` prints nothing.
- `grep -rln "width: 390" src` prints only `src/lib/e2e-phone.ts`.
- `bunx playwright test --list --grep @mobile` lists every tagged test under `mobile` or `mobile-multi`, and under no other project.
- `grep -rln 'class="brand"' src` prints only `src/lib/header/AppHeader.svelte`.
- `grep -n route.id src/routes/+layout.svelte` and `grep -rn "content: 'Settings'" src` print nothing.
- `bunx vitest run markdown` passes, and the Chapter page has no `$effect` that edits its article.
- Issues #134, #241, #244, #245, #246, #247, #313 and #325 are closed.
- The orchestrator cuts 1.19.2 from the release PR, as `docs/releasing.md` describes, and records the cut there.
- Releases stay `1.x`.

**Status (2026-11-05):** exit met.
- **Cards:** all 25 Sprint 15 cards are Done. The planned 22 grew by three, all in Release 1.19.2:
  - C200, release-please's retry after a rate-limit failure, filed in Sprint 14 and planned into this sprint;
  - C203, filed after C165's 1100 px block showed Sign in scrolling sideways by 86 px between 768 and 1100 px;
  - C204, filed after C162 left the editor's height floor on a `:last-child` rule.

  One orchestrator PR, #460, fixed `main`'s breakpoints guard after C167 and C171 merged side by side: the Problem's middle query is tied to `AppHeader.svelte` too.
- **CI:** `ci` is green on `main` at 96e02fd, the last card's merge.
- **Checks:**
  - `bunx vitest run breakpoints` passes. `grep -rn 901px src` prints only two lines of the guard's own test in `src/lib/styles/breakpoints.test.ts`, which checks that no CSS holds `901px`.
  - `grep -rln "width: 390" src` prints only `src/lib/e2e-phone.ts`.
  - `bunx playwright test --list --grep @mobile` lists six tagged tests, all under `mobile` or `mobile-multi`. It also lists the `setup` and `setup-multi` tests: those projects are dependencies of the two phone projects and always run whole.
  - `grep -rln 'class="brand"' src` prints only `src/lib/header/AppHeader.svelte`.
  - `grep -n route.id src/routes/+layout.svelte` and `grep -rn "content: 'Settings'" src` print nothing.
  - `bunx vitest run markdown` passes. The Chapter page's one `$effect` is the reach-end observer, which posts the Read action and does not edit the article.
  - #134, #241, #244, #245, #246, #247, #313 and #325 are closed.
- **Release:** this card's merge carries `Release-As: 1.19.2`. The orchestrator then cuts 1.19.2 from the release PR and records the cut in `docs/releasing.md`.
- **Reviews:** none, as planned. No card touched the Runner, the container flags, the Docker socket, a security rule or a response header.

| Card | PR | What landed |
|---|---|---|
| C156 | #445 | The Problem screen's wide layout starts above 900 px, so 900 to 901 px is no longer a gap. |
| C157 | #453 | `view.ts`: one view state for the Problem screen's two tab sets. |
| C158 | #441 | F3's phone sizes as tokens. |
| C159 | #442 | The Markdown renderer emits named, keyboard-reachable scroll boxes for code and tables. |
| C160 | #443 | One phone module (`src/lib/e2e-phone.ts`), and phone flows picked by the `@mobile` tag. |
| C161 | #448 | One `AppHeader`, drawn from a header model. |
| C162 | #456 | The Problem panes render from the view. |
| C163 | #447 | The Map's figure and column read one Topic entry. |
| C164 | #449 | The Chapter has no Markdown fix-up in the browser. |
| C165 | #450 | Sign up and Accept invite switch at the phone breakpoint, as Sign in does. |
| C166 | #457 | One head line for the statement, Hints and Solution. |
| C167 | #458 | The Problem screen uses the `AppHeader`. |
| C168 | #452 | The Chapter's Problem table becomes the shared `ProblemTable`. |
| C169 | #455 | Sign in, Sign up and Accept invite keep what a visitor typed before hydration. |
| C170 | #451 | The Local server's phone tests use the phone module. |
| C171 | #454 | A test holds every media query to the named breakpoints in `src/lib/styles/breakpoints.ts`. |
| C172 | #463 | Setup keeps what a visitor typed before hydration. |
| C173 | #462 | The BLC wordmark link is named "BLC, Beyond Leetcode Map". |
| C174 | #459 | The statement, Hints and Solution style their scroll boxes on a phone. |
| C175 | #466 | A Topic draws each Problem once, with the shared `ProblemTable`. |
| C176 | #465 | The Multi-user server's phone tests use the phone module. |
| C177 | this PR | Exit check and `Release-As: 1.19.2`. |
| C200 | #444 | release-please tries once more after a rate-limit failure. |
| C203 | #464 | Sign in no longer scrolls sideways between 768 and 1100 px. |
| C204 | #461 | The editor's height floor is one `--editor-min` property. |

Decided along the way:
- **The maintainer's questions:** taken by the orchestrator on 2026-11-04 under the maintainer's rule to take the recommended option unless it is a hard call. Each is recorded on its cards and issue:
  - #245: phone tests run with touch, through one `phone` setting (C160);
  - #244: no new dependency, and the test is the guard; Setup keeps 900 px and Settings, Users and Change password keep 800 px, each tied to its files (C171); the shared Problem row restyles one table on a phone, as the Chapter does (C175);
  - #325: option 2 for the fields typed into before hydration (C169, C172), and option 1 for the Problem screen's tabs, which are accepted as not working before hydration.
- **C165's 1100 px block:** C165 added an account-forms query at `max-width: 1100px` that its card did not ask for. The orchestrator kept it: C171 names it and ties it to the Sign in, Sign up and Accept invite pages, and C203 fixed the overflow it showed on Sign in.
- **Map links in tests:** C173's link name contains "Map", so locators that matched "Map" as a substring were made exact: `problem.e2e.ts` (C170) and `accept.multi.e2e.ts` (C173, its Files line widened).

For the maintainer:
- **Dependabot:** #432 (`tailscale/github-action` 4.3.0 to 4.4.0, the action `notify.yml` pins) and #433 (five bun minor and patch bumps) are open and left for you.
- **The fork-bomb overrun** (C201, Sprint 16) still flakes `sandbox` now and then. A re-run passes.

**Not in the sprint:**
- #134's first point: each tab navigation still re-runs `learner.problem()`. The direction as extended on 2026-10-25 does not cover it. Stopping it, with a load that ignores `?tab`, would change when the Problem is re-read. C166 closes #134 with this noted, and a card follows if the maintainer wants one.
- Run and Submit, which the Problem screen draws twice. Both copies render one snippet (`runAndSubmit`), so they cannot drift, and the boards place them in two places.
- The other second copies, each kept because its board shows different content (#244 keeps such copies):
  - the Chapter's two sets of Topic and Next links, "← Topic" beside the text and "↑ Topic" at its end;
  - the Map's figure and its column (C163 shares their data);
  - the header's two wordmarks.
- Setup's 900 px and Settings', Users' and Change password's 800 px breakpoints stay, tied to their files by C171, unless the maintainer answers otherwise.
- #241's optional note on the canvas's F.10f would be a design card. It is not filed.
- #325's option 3, making the Problem tabs work before hydration. The recommended answer accepts that they do not.

## Sprint 16 · Languages and the Learning core

**Goal:** each Language is described once and read from there; the Sandbox harness is a real Python file whose per-Language rules are one tested table; and the Learning core's Main Line navigation, a Learner's stored state, the access check and the boundary with the Content catalogue each have one home. Nothing a Learner can see changes.

Release `R v1.19.3: Sprint 16 · Languages and the Learning core`, version 1.19.3 (patch, because no card is `feat`: every card is `refactor`, `test`, `ci` or `docs`).

- **From the backlog.** Six architecture issues from the reviews after Sprints 2, 3 and 6 (#101, #104, #107, #133, #135, #307), plus C131. Each claim was checked against `main` at a7a83c6, and only what still holds became a card. Already done:
  - the six written-out Language lists, and TypeScript and Go highlighting (C15, #112);
  - the content check's own copy of Submit's calls (C107, #353);
  - `engine.listByLabel` (C80, #300) and the duplicated `freePort` (C82, #311);
  - the ProblemView built on every autosave, Run and Submit (C73, #303, `openStep`).
- **Twenty cards in six lanes.** Codes C178 to C196, plus C131.
  - **Learning core** (the Content catalogue, `rules.ts`, `core.ts`, `progress.ts`):
    - C178 gives the catalogue each Problem's place on the Main Line and each Test's name.
    - C179 adds table tests for `judge`, `submitPlan`, `problemView` and `validateBuild`, before anything changes them.
    - C186 makes `rules.ts` read the Main Line and Test names from the catalogue. It follows C178 and C179.
    - C187 leaves one export named `LANGUAGES`. It follows C178 and the Languages lane.
    - C190 names the access check, `requireOpenTopic`. It follows C186 and C187.
    - Then C193 (revealed Hints and the Language per Topic), then C195 (Build steps), both stored through `progress.ts`.
    - C194, the Submit plan in a module that content and learning both import, follows C190 and waits for the maintainer's answer on #307.
  - **Core tests:** C180, one `setup` in `core.test.ts`.
  - **Languages**, three cards with no shared file, all ready at once:
    - C181 adds each Language's extension, and keys the editor's highlighting by Language.
    - C182 makes the smoke test read the Language list.
    - C183 makes CI read the Sandbox images from `config.ts`, with one publish job.
  - **Harness** (`src/lib/server/runner/`):
    - C184 moves the harness to `harness.py`.
    - Then C188 makes its per-Language rules one table, and C191 table-tests them without Docker. C191 waits for the maintainer's answer on `python3`.
    - Then C189 writes the harness protocol in one place, and C192 gives the sandbox tests one Runner start.
    - C131, the fork-bomb test's bound, comes before C192.
  - **Runner port:** C185, one schema for each shape.
  - **Last:** C196, the exit check and `Release-As: 1.19.3` (`docs/releasing.md`, The last card).
- **Issues closed.**
  - C187 closes #101 and #135. It waits for C181 to C183. Both issues' harness half was folded into #104 when they were triaged.
  - C191 closes #104, after C184, C185, C188 and C189.
  - C192 closes #107, after C178 to C180, C183 and C186.
  - C195 closes #133. C194 closes #307.
- **Reviews.** Before merge, the orchestrator runs `sandbox-security-reviewer` on C184, C185, C188, C189, C191, C192 and C131. They are every card that touches `src/lib/server/runner/`. No card changes a security rule.
- **Waiting on the maintainer.** C191 waits for the `python3` question, and C194 for #307's option. The orchestrator does not dispatch either until the maintainer answers.
- **Shared files**, each an ordered chain:
  - `content/catalogue.ts`: C178, then C187, then C194.
  - `content/catalogue.test.ts`: C178, then C194.
  - `learning/rules.ts`: C186, then C190, then C194.
  - `learning/rules.test.ts`: C179, then C186, then C190.
  - `learning/core.ts`: C187, then C190, then C193, then C195.
  - `learning/progress.ts`: C193, then C195.
  - `runner/harness.ts`: C184, then C189.
  - `runner/harness.py`: C184, then C188.
  - `runner/http-adapter.sandbox.test.ts`: C189, then C192.
  - `runner/escape.sandbox.test.ts`: C131, then C192.
- **Rounds:** 14.
  - The longest chain is five cards: C178, C186, C190, C193, C195.
  - There are seven sandbox reviews.
  - The last card and the cut add one round each.
  - Round 1 has nine ready cards for about four lanes at once, and the `sandbox` tests share one lock on this host. Start the Learning core and Harness lanes first.
- **ADR 0002 stands.** One harness serves every image and branches only to compile and to run. It is still sent with `python -I -c`, so no Sandbox image, Dockerfile, mount or container flag changes. The app image already copies `src/lib/server/runner/` whole.

**Exit:**
- All twenty Sprint 16 cards are Done, and `ci` is green on `main`.
- `src/lib/languages.ts` is the only module that exports `LANGUAGES`, and `src/routes/smoke.smoke.ts` declares no Language of its own.
- `ci.yml` has one Sandbox publish job, and its matrix comes from `config.ts`.
- `harness.ts` holds no Python. `harness.py` tests the Language only through its `LANGUAGES` table. The `unit` job runs `harness.test.ts`.
- `grep -n "mainLine.indexOf\|lastIndexOf('/')" src/lib/server/learning/rules.ts` prints nothing.
- `src/lib/server/learning/core.ts` names no Prisma model, and `core.test.ts` defines one `setup`.
- No file under `src/lib/server/content/` imports from `src/lib/server/learning/`.
- #101, #104, #107, #133, #135 and #307 are closed.
- The orchestrator cuts 1.19.3 from the release PR (`docs/releasing.md`) and records the cut. Releases stay `1.x`.

**Status (2026-11-05):** exit met.
- **Cards:** all 23 Sprint 16 cards are Done. The planned 20 (C178 to C196, plus C131) grew by three, all in Release 1.19.3:
  - C198 and C199, filed after flakes on Sprint 14's CI;
  - C201, filed after the sandbox-security review of #435 failed C131's first attempt.
- **CI:** `ci` is green on `main` at 4fa5b9d, the last card's merge.
- **Checks:**
  - `src/lib/languages.ts` is the only module that exports `LANGUAGES`, and `src/routes/smoke.smoke.ts` names no Language id, name or entry file.
  - `ci.yml` has one Sandbox publish job, `publish-sandbox`. Its matrix comes from the `sandbox-images` job, which reads `runner/config.ts`. Both legs, node and go, succeeded on C183's merge commit.
  - `harness.ts` holds no Python. `harness.py` tests the Language only through its `LANGUAGES` table and does its work only from `main()`. The `unit` job runs `harness.test.ts`.
  - `grep -n "mainLine.indexOf\|lastIndexOf('/')" src/lib/server/learning/rules.ts` prints nothing.
  - `core.ts` names no Prisma model, and `core.test.ts` defines one `setup`.
  - No file under `src/lib/server/content/` imports from `src/lib/server/learning/`.
  - #101, #104, #107, #133, #135 and #307 are closed.
- **Release:** this card's merge carries `Release-As: 1.19.3`. The orchestrator then cuts 1.19.3 from the release PR and records the cut in `docs/releasing.md`.
- **Reviews:** every card that edits a file under `src/lib/server/runner/` had a `sandbox-security-reviewer` pass before merge. That is C131, C184, C185, C188, C189, C191, C192 and C198. Two went back to their workers first:
  - C188: a committed `__pycache__` .pyc, the table's missing `entry` and `ext`, and a dead duplicate of the compile-error regexes. Then `.dockerignore` needed `**/__pycache__`.
  - C191: six rows whose toolchain output the Sandbox never prints. Also, python3 was not gated by harness.py's pin, so a harness that acted at import could have run on the host.

  C131 also took four low findings before merge.

| Card | PR | What landed |
|---|---|---|
| C131 | #486 | The fork-bomb teardown is logged (the kill's result, a slow remove by name), and its test is bounded by the design, 28 s, and prints the container's lifetime. |
| C178 | #469 | The Content catalogue gives each Problem's place on the Main Line (`mainLinePlace`) and each Test's `name`. |
| C179 | #475 | Table tests for `judge`, `submitPlan`, `problemView` and `validateBuild`. |
| C180 | #471 | One `setup` in core.test.ts. |
| C181 | #470 | Each Language's file extension; the editor's highlighting is keyed by Language. |
| C182 | #472 | The smoke test reads the Language list. |
| C183 | #473 | CI reads the Sandbox images from `config.ts`, with one `publish-sandbox` job. |
| C184 | #468 | The harness moves to `harness.py`. |
| C185 | #480 | One zod schema for each Runner port shape, in `port.ts`. |
| C186 | #483 | rules.ts reads the Main Line and Test names from the catalogue. |
| C187 | #485 | One list named `LANGUAGES`, in `src/lib/languages.ts`. |
| C188 | #478 | harness.py's per-Language rules as one table, and a pure `classify_compile`; its work runs from `main()`. |
| C189 | #479 | The harness protocol (`harnessEnv`, `harnessInput`, `harnessLine`) written once, in harness.ts. |
| C190 | #487 | `requireOpenTopic`: the access check as one named rule. |
| C191 | #488 | The compile-error rules as a table test without Docker, through the host's python3, gated by harness.py's sha256 pin. |
| C192 | #494 | One Runner start (`startTestRunner`) for the sandbox tests. |
| C193 | #489 | Revealed Hints and the Language per Topic stored through progress.ts. |
| C194 | #492 | The Submit plan in a leaf module, `submit-plan.ts`, which content and learning both import. |
| C195 | #493 | Build steps stored through progress.ts; core.ts names no Prisma model. |
| C196 | this PR | Exit check and `Release-As: 1.19.3`. |
| C198 | #484 | An engine removal's poll never starts with under 20 ms left (a `fix`: the engine sent one poll after its deadline). |
| C199 | #490 | Research: where a TypeScript Submit late on a long Main Line spends its time (`docs/research/typescript-submit-timing.md`). |
| C201 | #474 | Research: why a fork-bombed container's forced remove hangs past its hard stop (`docs/research/fork-bomb-teardown.md`). |

Decided along the way:
- **The maintainer's questions.** On 2026-11-04 the maintainer asked the orchestrator to take the recommended option on any question that is not a hard call. Each answer is recorded on its card and issue:
  - `python3` for `bun run test`: yes, 3.12 or later, with no Python linter (C191);
  - #307: option 2, a leaf module both import (C194);
  - #101: closed by C187, with the Sandbox image tags and Go's `/exec` flag kept keyed by Language, as planned;
  - #107: closed by C192, with the port's `limits`, `outcome.ts` and `scripted-catalogue.ts` left as planned.
- **C131 and C201, the fork-bomb teardown.** C201 measured that a fork-bombed container takes seconds to die after the hard stop's SIGKILL, and the forced remove waits for that death. It recommended observing first, with no flag or limit change. C131 was re-specified from that:
  - the kill is logged;
  - a slow remove names itself;
  - the test asserts the design bound, `containerTimeoutMs + 2 * removeAttemptTimeoutMs` (28 s), and prints the container's own lifetime.

  The review judged #435's objection partly answered. Asserting the lifetime once CI has data is #491.
- **Files lines widened by the orchestrator:**
  - C184 added `harness.test.ts`, which C191 then extended;
  - C188 added `.gitignore` and `.dockerignore`;
  - C131 added `sandbox.test.ts`;
  - C190 added a guard test to `core.test.ts`, as its brief asked.
- **The host's resource rule (2026-11-05).** An out-of-memory kill at 04:17 UTC took down every session; C201's probes had run 20 fork-bomb containers at 2 GB each. Since then, at most two card-builders run at once, heavy local jobs run one at a time, and Docker experiments run one container at a time at the Runner's limits (`docs/agents/board.md`, Resources). The restart lost every subagent mid-card. The orchestrator took over C178, C180, C181, C182 and C183, which were green, and merged them after a Codex second opinion where the worker had not run one.

For the maintainer:
- **Filed during the sprint, `needs-triage`:**
  - #481: Dockerfile.sandbox-go's comment points at harness.ts;
  - #482: the harness line schema strips unknown fields rather than refusing them;
  - #491: assert the fork-bomb container's lifetime;
  - #495: a correct TypeScript Submit late on a long Main Line can hit the hard stop on a slow host. C199's doc recommends compiling once and running `node main.js`.
- **Also filed:** #496: start.sandbox.test.ts starts its test Runner on 0.0.0.0. C192 moved the shared helper's Runners to 127.0.0.1.
- **Dependabot** #432 (`tailscale/github-action` 4.4.0) and #433 (five bun bumps) are still open. The release run's Tailscale step warns that `authkey` is deprecated in favour of an OAuth client.

**Not in the sprint:**
- **Kept keyed by Language:** the Sandbox image tags stay in `runner/config.ts`, and Go's `/exec` tmpfs stays a `language === 'go'` flag in `containerSpec`, where C15 and ADR 0002's amendment put them. Whether that is enough to close #101 is a question for the maintainer.
- **Docker compile-error cases stay**, because they check the real toolchains' output. No Python linter is added: Ruff would be a new dependency.
- **Left as they are, from #107:** the Runner port's `limits`, which the sandbox and escape tests use to lower the per-Test limit. Also the Problem screen's `outcome.ts`, which belongs to Sprint 15's area, and `scripted-catalogue.ts`'s split of a Test id, since the e2e fake only sees ids. Whether #107 closes without them is a question for the maintainer.

## Sprint 17 · Runner and CI hardening

**Goal:** the Runner, the Sandbox and CI are hardened where the reviews after Sprints 14 to 16 found them open, and the fixes reach Instances. The five Runner follow-ups and four hardening findings are fixed, both Dependabot PRs are settled, CI is ready to leave the deprecated Tailscale auth key, and the Upgrading steps upgrade.

Release `R v1.19.4: Sprint 17 · Runner and CI hardening`, version 1.19.4 (patch, because no card is `feat`: the cards are `fix`, `test`, `ci`, `docs` and `chore`). release-please's #499 already proposes 1.19.4.

- **Scope.** The maintainer set it on 2026-11-08:
  - the Runner follow-ups: #481, #482, #491, #495 and #496;
  - the Dependabot PRs #432 and #433;
  - the Tailscale and token items. Here that is #535's part 1, the Tailscale OAuth fallback, and a runbook for both of its parts.

  The orchestrator added six findings from the hardening and docs sweeps the maintainer asked it to run:
  - the hardening findings that edit the same files as those cards, so the files are not reopened next sprint: #530 and #534 in the Runner, #531 and #532 in the CI workflows;
  - #506, because 1.19.4's fixes reach Instances only if the Upgrading steps work.

  Everything else the sweeps found waits for Sprint 18 (see Not in the sprint).
- **Fifteen cards, C205 to C219.** Two more, C220 and C221, are filed with no Sprint.
  - **Sandbox** (`runner/sandbox.ts`, `sandbox.test.ts`, `escape.sandbox.test.ts`):
    - C205 sets every Sandbox's core rlimit to 0 (#530).
    - Then C209 fails the Run on a harness line with an unknown field or an out-of-range Test (#482).
    - Also after C205, C211 asserts the fork-bombed container's own lifetime (#491).
  - **Harness:** C207 compiles TypeScript once, and runs the emitted JavaScript for each Test (#495).
  - **Runner config and tests**, no shared file:
    - C213: the Runner refuses `.env.example`'s placeholder token, and the example binds 127.0.0.1 (#534).
    - C215: start.sandbox.test.ts binds its Runner to 127.0.0.1 (#496).
    - C217: Dockerfile.sandbox-go's comment points at harness.py (#481).
  - **Workflows** (`notify.yml`, `release.yml`):
    - C210 merges Dependabot's `tailscale/github-action` 4.4.0 (#432).
    - Then C214: notify.yml sends an issue's title only when the repo's own people wrote it (#532).
    - Then C216: both tailnet joins take a Tailscale OAuth client, with the auth key as fallback (#535, part 1).
  - **CI and dependencies:**
    - C212 pins ci.yml's third-party actions by SHA, and a lint step checks every pin (#531).
    - C206 merges Dependabot's bun group (#433).
  - **Docs:**
    - C208: the Upgrading steps change the image tag in `.env` first (#506).
    - C218: `docs/ci-credentials.md`, a runbook for the CI credentials, both parts of #535.
  - **Last:** C219, the exit check and `Release-As: 1.19.4` (`docs/releasing.md`, The last card).
- **Filed with no Sprint**, each fully specified and waiting on the maintainer:
  - C220 removes `authkey` from both workflows, once the maintainer has created the Tailscale OAuth client and added `TS_OAUTH_SECRET` (`docs/ci-credentials.md`). Only that silences the deprecation warning.
  - C221 moves release-please from RELEASE_PAT to a GitHub App token, once the maintainer answers #535's part 2. It follows C220 on `release.yml` and `docs/ci-credentials.md`. If the maintainer answers part 2 first, the orchestrator swaps the two.
- **Issues closed.** Each card closes its own issue:
  - C205 closes #530, C207 #495, C208 #506, C209 #482, C211 #491;
  - C212 closes #531, C213 #534, C214 #532, C215 #496, C217 #481.

  #535 stays open. C216 and C218 prepare it, and C220 and C221 finish it.
- **Decided before the sprint.** The orchestrator decided these on 2026-11-08, under the maintainer's rule to take the recommended option unless it is a hard call. Each is recorded on its issue:
  - #495: a Learner's runtime error still names `main.ts` and its line, through a source map, or a path rewrite if that measures cheaper.
  - #482: fail loudly. C209 also fails the Run on a line the strict schema refuses, as the orchestrator confirmed on 2026-11-08.
  - #491: the CI data is in, so the bound is `containerTimeoutMs + removeAttemptTimeoutMs`.
  - #432 and #433: merge once rebased and green.
  - #535's part 2: a new action and a change of token, so it is the maintainer's call. This sprint only prepares it.
- **Reviews.**
  - `sandbox-security-reviewer` before merge: C205, C207, C209, C211, C213, C215 and C217. They are every card under `src/lib/server/runner/` or in a Sandbox Dockerfile.
  - The orchestrator's security review:
    - C206, because better-auth is Identity and marked is the Markdown renderer;
    - C210, the action that holds the tailnet credential;
    - C212, the CI supply chain;
    - C214 and C216, secrets in CI;
    - C213, which changes the Runner token's rule.

    C220 and C221 get it too, when they run.
- **Shared files**, each an ordered chain:
  - `runner/sandbox.ts` and `sandbox.test.ts`: C205, then C209.
  - `runner/escape.sandbox.test.ts`: C205, then C211.
  - `.github/workflows/notify.yml`: C210, C214, C216, then C220.
  - `.github/workflows/release.yml`: C210, C216, then C220 and C221.
  - `docs/ci-credentials.md` (new in C218): C218, then C220 and C221.
  - `docs/releasing.md`: C218, then C221.
- **Two lanes a round** (`docs/agents/board.md`, Resources). Lane A holds the Runner cards, one a round, because the `sandbox` tests share one lock.

  | Round | A · Runner | B · CI, dependencies and docs |
  |---|---|---|
  | 1 | C205 core rlimit 0 (#530) | C206 bun group (#433) |
  | 2 | C207 TypeScript compiled once (#495) | C208 Upgrading steps (#506) |
  | 3 | C209 strict harness line (#482) | C210 tailscale 4.4.0 (#432) |
  | 4 | C211 fork-bomb lifetime (#491) | C212 SHA pins (#531) |
  | 5 | C213 placeholder token (#534) | C214 notify authors (#532) |
  | 6 | C215 test Runner on 127.0.0.1 (#496) | C216 OAuth fallback (#535) |
  | 7 | C217 Go Dockerfile comment (#481) | C218 credentials runbook (#535) |
  | 8 | C219 exit check and `Release-As: 1.19.4` | |

  C206 goes first in lane B, so every later card builds on biome 2.6.4's format. C206 and C210 are Dependabot's PRs, so the orchestrator can work them itself, without a card-builder.
- **Rounds: 22.**
  - The longest chain is three cards (C210, C214, C216), so the two lanes set the build: seven rounds.
  - There are 13 reviews: seven sandbox and six security.
  - The last card and the cut add one round each.
  - A review of one lane's card can run while the other lane builds.
- **No limit or image changes.** C205 adds one container flag to ADR 0002's list, without reopening the ADR. C207 changes no flag, limit or image. C217 changes a comment, and the Go image's tag stays.

**Exit:**
- All fifteen Sprint 17 cards are Done, and `ci` is green on `main`.
- `containerSpec` sets the core rlimit to 0 for every Language, and the `sandbox` job's escape test finds it at (0, 0).
- `grep -n -- '--noEmit' src/lib/server/runner/harness.py` prints nothing, and a TypeScript runtime error in the `sandbox` job names `main.ts` and its line.
- ci's `lint` job checks that every non-`actions/*` `uses:` has a 40-hex ref, and it passes on `main`.
- `grep -c 'oauth-secret: ${{ secrets.TS_OAUTH_SECRET }}' .github/workflows/notify.yml .github/workflows/release.yml` prints 1 for each file.
- `grep -n 'harness.ts' Dockerfile.sandbox-go` prints nothing, and `.env.example` sets `RUNNER_HOST="127.0.0.1"`.
- #432 and #433 are merged, or closed with the reason on the PR.
- `docs/ci-credentials.md` exists and `docs/releasing.md` links to it. C220 and C221 are on the board, Todo, with no Sprint.
- #481, #482, #491, #495, #496, #506, #530, #531, #532 and #534 are closed.
- The orchestrator cuts 1.19.4 from the release PR (`docs/releasing.md`) and records the cut. Releases stay `1.x`.

**Status (2026-11-08):** exit met.
- **Cards:** all 16 Sprint 17 cards are Done. The planned 15 (C205 to C219) grew by one, in Release 1.19.4: C222. C205's sandbox review showed that a core limit of 1:1 alone can be undone, because Learner code may lower its own soft limit. C220 and C221 are on the board, Todo, with no Sprint, waiting for the maintainer.
- **CI:** `ci` is green on `main` at aae47f5, the last card's merge.
- **Checks:**
  - `containerSpec` sets the core rlimit to **1:1** for every Language. The exit line said 0, but C205 amended that: the kernel ignores a limit of 0 for a piped `core_pattern`, and 1 is the value that stops the dump before the helper starts. `harness.py`'s seccomp filter (C222) keeps the limit at 1. The `sandbox` job's escape tests find (1, 1), are refused when they try to raise or lower it, and abort without a core dump.
  - `grep -n -- '--noEmit' src/lib/server/runner/harness.py` prints nothing. `http-adapter.sandbox.test.ts` checks that a TypeScript runtime error names `main.ts` and the Learner's line.
  - ci's `lint` job runs `.github/check-pins.sh`, which accepts a third-party `uses:` only with a 40-hex ref, and its fixtures (`pins.test.sh`). Both pass on `main`.
  - `grep -c 'oauth-secret: ${{ secrets.TS_OAUTH_SECRET }}'` prints 1 for each of `notify.yml` and `release.yml`.
  - `grep -n 'harness.ts' Dockerfile.sandbox-go` prints nothing, and `.env.example` sets `RUNNER_HOST="127.0.0.1"`.
  - #432 is merged. #433 was closed by Dependabot after the rebase was asked for, and replaced by #537, which is merged. Dependabot's #549, `docker/login-action` 4.8.0, opened during the sprint and was merged after review.
  - `docs/ci-credentials.md` exists, and `docs/releasing.md` links to it.
  - #481, #482, #491, #495, #496, #506, #530, #531, #532 and #534 are closed. #535 stays open for C220 and C221. #546 had closed it, because "does not close #535" was read as a closing keyword, and the orchestrator reopened it.
- **Release:** this card's merge carries `Release-As: 1.19.4`. The orchestrator then cuts 1.19.4 from the release PR and records the cut in `docs/releasing.md`.
- **Reviews:**
  - **`sandbox-security-reviewer`** before merge on C205, C207, C209, C211, C213, C215, C217 and C222. Two went back first:
    - C205's soft-limit escape (F1);
    - C211's PR body and its measurement.
  - **The orchestrator's two-reader review** (Fable and Codex) on C206 (#537), C210 (#432), C212, C213, C214, and C216 with #549. C212 went back once, for two lint bypasses the orchestrator confirmed on a scratch copy, and for setup-qemu's `binfmt:latest`.

| Card | PR | What landed |
|---|---|---|
| C205 | #538 | Every Sandbox's core rlimit is 1:1. |
| C206 | #537 | Dependabot's bun group: better-auth 1.7.17, SvelteKit 3.1.1, marked 18.1.3, biome 2.6.5 and five more. It replaced #433. |
| C207 | #541 | TypeScript compiles once, and each Test runs the emitted JavaScript, with source maps. One 25-Test container: 6.3–7.2 s before, 3.8 s after. |
| C208 | #539 | The Upgrading steps set the new image tag in `.env` first. |
| C209 | #548 | A harness line with an unknown field, an out-of-range Test or trailing bytes fails the Run. A hard-stopped Run stays a timeout. |
| C210 | #432 | `tailscale/github-action` 4.4.0. |
| C211 | #547 | The fork-bombed container's own lifetime and its destroy time are asserted. |
| C212 | #540 | ci.yml pins its third-party actions by SHA, and lint checks every pin. The binfmt image is pinned by digest, and `publish-sandbox` needs `lint`. |
| C213 | #542 | The Runner refuses `.env.example`'s token, and the example binds 127.0.0.1. |
| C214 | #545 | notify.yml sends an issue's title only when the repo's own people wrote it. |
| C215 | #543 | start.sandbox.test.ts binds its Runner to 127.0.0.1. |
| C216 | #550 | Both tailnet joins take the Tailscale OAuth client, with the auth key as fallback. |
| C217 | #544 | Dockerfile.sandbox-go's comment points at harness.py. |
| C218 | #546 | `docs/ci-credentials.md`, the runbook for the CI credentials. |
| C219 | this PR | Exit check and `Release-As: 1.19.4`, plus the runbook's leak, ACL and rotation steps, and two self-hosting wording fixes. |
| C222 | #551 | A seccomp filter holds every Sandbox's core rlimit at 1. |

Decided along the way. Each decision was taken under the maintainer's rule to take the recommended option, and is recorded on its card and issue:
- **The core rlimit.**
  - C205 found that 0 doesn't stop a piped helper, so the limit became 1:1.
  - Its review then found that Learner code can lower the soft limit (F1). C205 merged 1:1, worded as cover for crashes that are not deliberate.
  - C222 closed #530 with the reviewer's seccomp filter, and documented the kernel-log cost and the operator's non-pipe `core_pattern` option.
- **#482:** a line the strict schema refuses fails the Run too, and so do trailing bytes after a normal end.
- **#495:** a Learner's runtime error keeps naming `main.ts` and its line, through source maps.
- **C212's pin checker** became a restricted syntax: a canonical `uses: <value>`, or the line fails. It runs with a stop rule: forms only a hostile workflow author would write are accepted residuals.
- **C211's measurement:**
  - the events window starts at the test's start, and the bomb must have a `start` event;
  - a `destroy` bound covers #435's slow-removal reading;
  - a create that fails turns the test red.
- **#491's kill attribution** was corrected on the issue. The 44–53 ms kill lines are from http-adapter's hard-limit test. Every fork-bomb container in those runs was ended by the kernel (exit 137) before the hard stop.
- **Files lines widened by the orchestrator:**
  - C212 added `release.yml`, `check-pins.sh` and `pins.test.sh`;
  - C222 added `http-adapter.sandbox.test.ts`, from C207's review;
  - C209 and C213 each fixed a stale comment in a file they already edited;
  - C219 adds `docs/ci-credentials.md` and `docs/self-hosting.md`.
- **Scope:** the maintainer set it (the Runner follow-ups, the Dependabot PRs, the Tailscale and token items). The orchestrator added the hardening findings in the same files (#530, #531, #532, #534), and #506.

For the maintainer:
- **#535, one ask:**
  - Part 1: create the Tailscale OAuth client as `docs/ci-credentials.md` says, with the ACL limit and rotation steps, and add `TS_OAUTH_SECRET`. That unblocks C220.
  - Part 2: answer whether release-please moves to a GitHub App token (C221) or keeps `RELEASE_PAT`.
- **Held for Sprint 18,** which the maintainer plans after a separate architecture review. These are the issues filed on 2026-11-08:
  - architecture: #500 to #505, and #512 to #521;
  - docs: #507 to #511;
  - accessibility: #522 to #529;
  - #533.
- **Follow-ups found by this sprint's reviews,** none blocking:
  - `check-pins.sh` scans `.github/workflows/` only, not a future `.github/actions/`;
  - the binfmt pin is bumped by hand;
  - the push and `workflow_run` payloads carry an outsider's merged text, labelled only by the merger;
  - a CI test is missing for `prlimit64` aimed at PID 1;
  - `biome.json`'s `$schema` still says 2.6.2;
  - small comment nits in the Dockerfile and on C217.
- **GitGuardian:** incidents 39252375 and 39260283 are false positives. Only the maintainer can mark them.

**Not in the sprint:**
- **Held for Sprint 18,** which the maintainer plans after a separate architecture review. No card, Sprint or Release is filed for them:
  - the architecture issues #500 to #505 and #512 to #521;
  - the docs issues #507 to #511;
  - the accessibility issues #522 to #529;
  - #533, the Markdown renderer's raw HTML and `javascript:` links.
- **#535's part 2,** the GitHub App: the maintainer's call. C221 waits for it, with no Sprint.
- **The deferred items in Sprints 14 to 16's "Not in the sprint"** stay as written there.

## Sprint 18 · Submission, Runner and Identity seams

**Goal:** the architecture review's first steps, in the order it recommends. A Submission is judged by one module that seam 3 also runs, and a container cut-off is no longer the Learner's Time Limit Exceeded. The Runner's harness transcript and its container lifecycle each have one home. The Multi-user Instance is built by one Identity factory that tests share, the Admin actions are one object, and Better Auth's HTTP surface is an allowlist. Beside them land the review's cheap wins and the sign-in flake.

Release `R v1.19.5: Sprint 18 · Submission, Runner and Identity seams`, version 1.19.5 (patch, because no card is `feat`: the cards are `fix`, `refactor`, `test`, `ci`, `build` and `docs`). release-please's #554 already proposes 1.19.5.

- **One backlog plan, Sprints 18 to 23.** On 2026-11-10 the orchestrator asked the `sprint-planner` to plan every open engineering issue, under the maintainer's standing rule:
  - the separate architecture review after Sprint 17 (2026-11-10): #556 to #578, and the grouped smaller findings #579 to #582. Thirteen older issues got a comment from it that extends them;
  - the architecture issues of 2026-11-08: #500 to #505 and #512 to #521;
  - the docs issues #507 to #511, the accessibility issues #522 to #529, and #533;
  - #555, a flake on main.

  Sprint 18 takes the review's recommended order. Sprints 19 to 23 took the rest; on 2026-11-10 they were re-planned issue first as Sprints 19 and 20, below. #570 is a card with no Sprint (see Not in the sprint), and the content issues are not engineering work. Each issue was read against `main` at 8a877f0.
- **Twenty-nine cards: C223 to C246, then C341 to C345.** The maintainer added C341 to C345 on 2026-11-10, which takes the sprint past the usual 25.
  - **Process** (#591): C341 makes issues the unit of work and has the sprint-planner run on Fable. The same PR batches small cards, caps the architecture review, bans card and issue ids in code comments, and moves the exited sprints to `docs/sprints-archive.md`. It is the sprint's first card. The orchestrator works it.
  - **The maintainer's code follow-ups:**
    - C342 checks C222's seccomp filter against the kernel headers (#592). It is a `sandbox-security-reviewer` run by the orchestrator, with no PR.
    - C343 adds a test for `engine.ts`'s remove poll (#593), before C237.
    - C344 makes the 30-sign-in test fast and drops its own timeout (#555, reopened), after C234.
    - C345 is the comments-only small-fixes PR (#594), after every other code card.
  - **Submission** (`learning/`, the content check, the catalogue's guard):
    - C223 makes one module, `learning/submission.ts`, judge a Submission, and `submit-plan.ts` builds each batch's Runner request (#518).
    - Then C227 moves `core.test.ts`'s batch and Verdict tests to it, C231 runs the content check through it, and C233 makes the catalogue's guard measure its requests through the HTTP adapter's body size (#518).
    - C241 decides what a cut-off means, after C229 marks one (#556). It waits for the maintainer's answer.
  - **Runner** (`runner/`):
    - C225 moves the harness transcript's read rules into a decoder in `harness.ts`, one decoder per stream (#521).
    - Then C229: a result marks the Tests the container cut off (#556).
    - Then C235: one module runs a container (#557), and C237 moves the Engine's deadlines onto its primitive.
    - C239 makes the sandbox test helpers run containers through that module and decode with the Runner's decoder (#557, #521).
  - **Identity** (`identity/`, `app.ts`, the Users and auth routes):
    - C230: one factory builds the Multi-user Instance (#513).
    - Then C232 makes the test harness the factory's test variant, and C234 moves every other route test onto it (#513).
    - Then C236: one Admin actions object, C238: the Users route calls it, and C240: the auth route gets a bound handler, so Locals holds no Better Auth (#512).
    - Then C242: the auth route serves an allowlist, and C244 and C245 close `/sign-out` and `/sign-up/email` over HTTP (#558). Both wait for the maintainer's answer.
  - **Cheap wins:**
    - C224 gives sign-in.test.ts's 30-sign-in test its own timeout (#555);
    - C226 stops the e2e job building Sandbox images (#564);
    - C228 makes the Dockerfile copy the server source whole (#563);
    - C243 gives the Problem screen one read of what the Learner may do now (#559).
  - **Last:** C246, the exit check and `Release-As: 1.19.5` (`docs/releasing.md`, The last card).
- **Issues → cards.** Each issue closes when its last card merges (`docs/agents/board.md`, Issues are the unit of work). The milestone `Sprint 18 · Submission, Runner and Identity seams` holds each of these issues.

  | Issue | Cards, in order | Last card | Lane |
  |---|---|---|---|
  | #591 Process: issues are the unit of work | C341 | C341 | orchestrator |
  | #592 C222's seccomp filter checked | C342 | C342 | orchestrator (review) |
  | #518 One module judges a Submission | C223, C227, C231, C233 | C233 | A |
  | #521 The harness transcript decoder | C225, then C239 | C239 | A |
  | #556 A container cut-off is not TLE | C229, C241 | C241 | A |
  | #593 The remove poll's test | C343 | C343 | A |
  | #557 One module runs a container | C235, C237, C239 | C239 | A |
  | #559 What the Learner may do now | C243 | C243 | A |
  | #564 e2e builds no Sandbox images | C226 | C226 | B |
  | #563 The Dockerfile copies whole | C228 | C228 | B |
  | #513 One Multi-user factory | C230, C232, C234 | C234 | B |
  | #512 One Admin actions object | C236, C238, C240 | C240 | B |
  | #558 The auth route's allowlist | C242, C244, C245 | C245 | B |
  | #555 The 30-sign-in test | C224 (timeout; rejected), then C344 (fast) | C344 | B |
  | #594 No ids in code comments | C345 | C345 | last |

  - C239 completes both #521 and #557. Its `Issue` field holds #557, and its `Refs` line names both.
  - C240 also does the auth-route item of #581, which stays open. #581 is proposed for wontfix once C240 lands (2026-11-10), so it has no milestone.
  - C241 closes #556 with its small step. The issue's larger step, where the Runner owns how many Tests fit a container, is not planned.
  - C246, the exit check, has no issue.
  - #581 stays open: C240 does its auth-route item; the rest waits for the maintainer's wontfix answer.
- **Waiting on the maintainer**, each with a recommended answer the orchestrator takes unless the maintainer says otherwise (none is a hard call):
  - **#556: what does a cut-off mean to the Learner?** Recommended: RunnerUnavailable, in Run and in Submit. It never shows a false Verdict, records nothing, adds no Runner call, and leaves `maxSubmitCalls` and the catalogue's guard as they are. The other options were a re-run of the batch, or TLE only when the cut Test was the Learner's own. C241 waits for it.
  - **#558: close `/sign-up/email` and `/sign-out` over HTTP?** Recommended: close both. No screen uses either, every form calls `auth.api` server-side, and `user.create.before` stays the backstop. C244 and C245 wait for it. If the two security readers split on either card, it waits for the maintainer.
  - **#521: does a duplicate `i` fail the Run?** Recommended: yes, as #482's "fail loudly" decided for the other malformed lines. It is part of C225.
- **Reviews.**
  - `sandbox-security-reviewer` before merge: C225, C229, C231, C233, C235, C237 and C239. They are every card under `src/lib/server/runner/`.
  - The orchestrator's two-reader review (Fable and Codex): C230, C236, C238, C240, C242, C244 and C245. They are every card that moves Identity wiring, the gate or the auth surface.
  - C232 and C234 are test code and a dead type variant, as C139 and C143 were in Sprint 14. C228 changes the app image, not a Sandbox image or a flag, and the Runner role's files are already copied whole.
- **Shared files**, each an ordered chain:
  - `learning/submission.ts`: C223, then C241. `learning/submission.test.ts`: C223, C227, then C241.
  - `learning/core.ts`: C223, then C241. `learning/core.test.ts`: C227, then C241.
  - `docs/module-map.md`: C223, C233, then C241.
  - `runner/harness.ts`, `harness-decoder.test.ts` (new in C225) and `port.ts`: C225, then C229.
  - `runner/sandbox.ts` and `sandbox.test.ts`: C225, then C235.
  - `runner/container.ts` (new in C235): C235, then C237.
  - `runner/http-adapter.sandbox.test.ts`: C229, then C239.
  - `routes/signin/sign-in.test.ts`: C224, then C234.
  - `lib/server/app.ts`: C230, C232, C238, then C240.
  - `identity/multi-user-instance.ts` (new in C230): C230, C236, C238, then C240.
  - `routes/users/users.test.ts`: C232, then C238.
  - `identity/accounts.ts`: C236, then C238. `identity/accounts.test.ts`: C234, then C236.
  - `src/app.d.ts`: C238, then C240.
  - `identity/auth-handler.ts` and its test: C240, C242, C244, then C245. `identity/auth.ts`: C244, then C245.
  - C236 also waits for C228, because `accounts.ts` is in `reset-admin-password`'s import graph, which the Dockerfile then copies whole.
- **Two lanes a round** (`docs/agents/board.md`, Resources). Lane A holds the Submission and Runner cards, one at a time, because the `sandbox` tests share one lock. Lane B starts with the cheap wins, then runs the Identity chain.

  | Round | A · Submission and Runner | B · Cheap wins, then Identity |
  |---|---|---|
  | 1 | C223 Submission module (#518) | C224 sign-in timeout (#555) |
  | 2 | C225 transcript decoder (#521) | C226 e2e builds no images (#564) |
  | 3 | C227 batch tests move (#518) | C228 Dockerfile copies whole (#563) |
  | 4 | C229 cut-off mark (#556) | C230 Multi-user factory (#513) |
  | 5 | C231 content check (#518) | C232 harness is the factory's variant (#513) |
  | 6 | C233 guard measures the requests (#518) | C234 every route test on it (#513) |
  | 7 | C235 container module (#557) | C236 Admin actions (#512) |
  | 8 | C237 Engine deadlines (#557) | C238 Users route (#512) |
  | 9 | C239 sandbox helpers (#557, #521) | C240 auth route handler (#512) |
  | 10 | C241 cut-off is RunnerUnavailable (#556) | C242 allowlist (#558) |
  | 11 | C243 what the Learner may do (#559) | C244 `/sign-out` closed (#558) |
  | 12 | | C245 `/sign-up/email` closed (#558) |
  | 13 | C246 exit check and `Release-As: 1.19.5` | |

  If the maintainer has not answered by round 10, lane A runs C243 first.
- **Rounds: 28.**
  - The longest chain is nine cards (C230 to C245 in lane B), and lane B's twelve cards set the build: twelve rounds.
  - There are 14 reviews: seven sandbox and seven security. A review of one lane's card can run while the other lane builds.
  - The last card and the cut add one round each.
- **No limit, flag or image changes.** ADR 0002 stands: one fresh hardened container per Run, with the same flags. C228 changes what the app image copies, not what it runs.

**Exit:**
- All 29 Sprint 18 cards are Done, and `ci` is green on `main`. The sprint's Status counts both issues closed and cards done.
- C342's review verdict is on #592. `grep -rnE '(//|#|\*).*(\bC[0-9]{2,3}[a-z]?\b|#[0-9]{2,3}\b)' src --include=*.ts --include=*.svelte --include=*.py` prints no comment line. The 30-sign-in test declares no timeout of its own.
- `grep -n "runSubmission\|export function judge\|export function submitPlan" src/lib/server/learning/rules.ts` prints nothing, and `content-check.sandbox.test.ts` imports nothing from `learning/rules.ts`.
- `grep -n "LONGEST_LANGUAGE_ID\|FILE_JSON_OVERHEAD" src/lib/server/content/catalogue.ts` prints nothing.
- `grep -n "TextDecoder\|harnessLine\|removeCreatedByName\|function within" src/lib/server/runner/sandbox.ts` prints nothing.
- A seam-1 test scripts a cut-off and gets the answer the maintainer chose (recommended: RunnerUnavailable).
- ci's `e2e` job neither pulls an image nor calls `build-sandbox-images.sh`, and the Dockerfile names no single file under `src/lib/server/identity/`.
- `grep -rln "createAccountActions(" src` lists only `account-actions.ts`, `account-actions.test.ts` and `multi-user-instance.ts`, and `grep -rn "kind: 'later'\|multiUser\.auth" src` prints nothing.
- `auth-handler.test.ts` shows a Better Auth path outside the allowlist answering 404.
- #512, #513, #518, #521, #555, #556, #557, #558, #559, #563, #564, #591, #592, #593 and #594 are closed, 15 issues. #581 stays open.
- Sprint 19 does not start until the maintainer answers the wontfix proposals for the open `architecture` issues (2026-11-10).
- The orchestrator cuts 1.19.5 from release PR #554 (`docs/releasing.md`) and records the cut. Releases stay `1.x`.

**Status (2026-11-11):** exit met.
- **Cards:** all 30 Sprint 18 cards are Done. The exit line says 29: C346 joined after the line was written, when C342's review found an arm64 gap (#598).
- **Issues:** 16 closed, each by its last card: #512, #513, #518, #521, #555, #556, #557, #558, #559, #563, #564, #591, #592, #593, #594 and #598. #581 stays open (C240 did its auth-route item; the rest waits for the maintainer's wontfix answer). Two issues were filed during the sprint: #598, fixed by C346, and #616 (`needs-triage`).
- **CI:** `ci` is green on `main` at 293b8d9, the last code card's merge.
- **Checks:**
  - C342's verdict is on #592. `grep -rnE '(//|#|\*).*(\bC[0-9]{2,3}[a-z]?\b|#[0-9]{2,3}\b)' src --include=*.ts --include=*.svelte --include=*.py` prints nothing. The 30-sign-in test (`sign-in.test.ts`) declares no timeout of its own and runs in about 0.7 s.
  - `rules.ts` has no `runSubmission`, `judge` or `submitPlan` export, and `content-check.sandbox.test.ts` imports `judgeSubmission` from `learning/submission.ts`, nothing from `rules.ts`.
  - `catalogue.ts` names neither `LONGEST_LANGUAGE_ID` nor `FILE_JSON_OVERHEAD`. `sandbox.ts` names none of `TextDecoder`, `harnessLine`, `removeCreatedByName` or `function within`.
  - `submission.test.ts` and `core.test.ts` script a cut-off and get RunnerUnavailable, the answer chosen for #556.
  - ci's `e2e` job neither pulls an image nor runs `build-sandbox-images.sh`, and the Dockerfile names no single file under `src/lib/server/identity/`.
  - `grep -rn "kind: 'later'\|multiUser\.auth" src` prints nothing. `grep -rln "createAccountActions(" src` lists the three files the exit line names and also `multi-user-instance.test.ts`: there it is a `vi.mock` wrapper that records the factory's options and calls the real one, not a second place that builds the actions. Accepted (C234).
  - `auth-handler.test.ts` shows every Better Auth endpoint outside the allowlist answering 404. After C244 and C245 the allowlist is `/callback/:id` alone, and `/sign-out` and `/sign-up/email` are in `disabledPaths` too.
- **Release:** this card's merge carries `Release-As: 1.19.5`. The orchestrator then cuts 1.19.5 from release PR #554 and records the cut in `docs/releasing.md`.
- **Reviews:**
  - **`sandbox-security-reviewer`** before merge on C223, C225, C229, C231, C233, C235, C237, C239, C343, C345 and C346, and C342 itself reviewed C222's seccomp filter (aae47f5). C342 found the arm64 gap that became #598 and C346.
  - **The orchestrator's two-reader review** (Fable and Codex) on C230, C232, C236, C238, C240, C242, C244 and C245. C244 and C245 each went back once: C244 to put `/sign-out` in `disabledPaths` as well; C245 for two tests that had stopped covering what they named (the router's error path, and the headers of a refused sign-up).
- **Flakes:** three, none caused by a card. C228's first `sandbox` run hit the known fork-bomb overrun (one re-run). Release PR #554's `sandbox` run hit a Docker kill stall on the runner (one re-run). #606's `unit` run hit an EPIPE from `engine.test.ts`'s trickling fake daemon; C237 fixed it.

| Card | PR | What landed |
|---|---|---|
| C223 | #585 | One module, `learning/submission.ts`, judges a Submission; `submit-plan.ts` builds each batch's Runner request. |
| C224 | #584 | The 30-sign-in test got a longer timeout. The maintainer rejected it; C344 replaced it. |
| C225 | #588 | `harness.ts` decodes the harness transcript, one decoder per stream. A duplicate `i` fails the Run. |
| C226 | #586 | ci's e2e job stops pulling and building Sandbox images. |
| C227 | #589 | `core.test.ts`'s batch and Verdict tests move to the Submission module. |
| C228 | #587 | The Dockerfile copies the server source whole. |
| C229 | #597 | A result marks the Tests the container cut off. |
| C230 | #590 | One factory builds the Multi-user Instance. |
| C231 | #596 | The content check judges through the Submission module. |
| C232 | #600 | The Identity test harness is the factory's test variant. |
| C233 | #608 | The catalogue's batch guard measures the Submission module's requests through the HTTP adapter's body size. |
| C234 | #603 | Every route test runs the factory's wiring. |
| C235 | #606 | One module, `runner/container.ts`, runs a container. |
| C236 | #607 | One Admin actions object. |
| C237 | #610 | The Engine's deadlines use the container module's primitive, in a leaf `deadline.ts`. |
| C238 | #609 | The Users route calls the Admin actions. |
| C239 | #613 | The sandbox test helpers run containers through the container module and decode with the Runner's decoder. |
| C240 | #612 | The auth route gets a bound handler, and Locals holds no Better Auth. |
| C241 | #611 | A batch the container cut off is RunnerUnavailable. |
| C242 | #614 | The auth route serves an allowlist; every other Better Auth path answers 404 first. |
| C243 | #602 | The Problem screen reads once what the Learner may do now. |
| C244 | #615 | `/sign-out` is closed over HTTP, at the allowlist and in `disabledPaths`; OAuth callback errors land on Sign in. |
| C245 | #617 | `/sign-up/email` is closed over HTTP; `beforeSignUp` and its rate rule go; `user.create.before` is the one backstop. |
| C246 | this PR | Exit check and `Release-As: 1.19.5`; the Admin refactor goes on the candidates list. |
| C341 | #595 | Issues are the unit of work, the planner runs on Fable, small cards share a PR, exited sprints move to the archive. |
| C342 | none | `sandbox-security-reviewer` on C222's seccomp filter; verdict on #592. It found the arm64 gap (#598). |
| C343 | #604 | `engine.ts`'s remove poll gets a test. |
| C344 | #605 | The 30-sign-in test signs the same person in 30 times and runs under the default timeout. |
| C345 | #618 | Code comments give reasons, not card or issue ids. |
| C346 | #599 | The seccomp filter refuses `ptrace`, closing the arm64 gap. |

Decided along the way. Each decision was taken under the maintainer's rule to take the recommended option, and is recorded on its card and issue:
- **#556:** a batch the container cut off is RunnerUnavailable, in Run and in Submit (C241). Open trade-off, noted on #556: Learner code that forces a cut-off now gets RunnerUnavailable instead of Time Limit Exceeded.
- **#558:** `/sign-out` and `/sign-up/email` are closed over HTTP (C244, C245). Sign out is Settings' `?/signout` action; sign-up is the forms. `onAPIError.errorURL` is `/signin`, so an OAuth callback error before the state is read lands on Sign in.
- **#521:** a duplicate `i` fails the Run (C225).
- **C224 then C344:** the maintainer rejected a longer timeout for the 30-sign-in test; C344 made it fast.
- **C232:** the factory refuses `passwordHasher` and `admit` overrides in production.
- **Files lines widened by the orchestrator:** C240 (seven files the bound handler reached), C242 (`setup.multi.e2e.ts`, which now expects 404 for `/get-session`), C244 (`handle.test.ts`, `auth.test.ts`), C245 (`signout.test.ts`), C246 (`docs/architecture-candidates.md`).

Not carded, recorded here:
- The Admin error classes stay exported, and the free `listAccounts`, `resetPassword` and `removeAccount` have no role check of their own; making them private behind the Admin actions is a refactor, so it is on `docs/architecture-candidates.md` (C238's review).
- `setup/+page.svelte` keeps a fallback text no state reaches (C232's review).
- `content-check.sandbox.test.ts` does not assert that `languages` is non-empty (C231's review).
- A stdout line with no newline is rescanned on each frame (`harness.ts`), bounded by the 32 MiB cap and the wall clock; only a compromised harness reaches it (C225's review).
- A must-change Account's sign-out with the real Better Auth is covered by e2e only (C244's review).
- `sandbox.ts`'s comment says the seccomp filter refuses `prlimit64` on `RLIMIT_CORE`; it refuses only a call that sets a new limit, and a read is allowed (C345's review).

For the maintainer:
- **`.wontfix-proposals.md`:** 28 `architecture` issues proposed for wontfix. Sprint 19 does not start until you answer.
- **#535:** the Tailscale OAuth client, and a GitHub App or RELEASE_PAT (C220, C221, C340).
- **#529:** axe is a new dependency, a hard call.
- **#616:** triage (narrow-screen Sign out for an Account that must change its password).
- **GitGuardian:** 39252375, 39260283 and 39899211 are false positives only you can mark.

**Not in the sprint:**
- **#556's larger step**, where the Runner owns how many Tests fit a container and the core sends isolation groups: speculative, size L, and it touches `maxSubmitCalls` and the adapter-timeout arithmetic. It is not planned, and #566 (the budget module where it would start) is proposed for wontfix.
- **#570**, the release webhook's shared notify script: card C340, with no Sprint. It edits `notify.yml` and `release.yml`, as C220 and C221 do, so it goes after them. C220 and C221 stay Todo with no Sprint, waiting on the maintainer's answer to #535.
- **Content and the spec:** #113, #252 to #268 and #24 are not engineering work. They stay open, `ready-for-human` or `ready-for-agent` as they are.
- **Everything else in the backlog** is planned in Sprints 19 and 20, below, re-planned issue first by the Fable sprint-planner on 2026-11-10 (the maintainer's rule, #591). The 28 `architecture` issues proposed for wontfix wait for the maintainer and are in no sprint.

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

**Status (2026-11-11):** exit met.
- **Cards:** all 26 Sprint 19 cards are Done. The exit line says 25: C385 joined during the sprint as critical work, when `ci` failed on `main` (#631).
- **Issues:** 10 closed, each by its last card: #522, #523, #524, #525, #526, #527, #528, #533, #616 and #631. #529 stays open for the maintainer's answer on axe; its no-dependency half is done (C358, C362).
- **CI:** `ci` is green on `main` at 3b2c279, the last code card's merge.
- **Checks:**
  - `markdown.test.ts` pins raw HTML escaped to text and a `javascript:` link rendered without its target, with exact output. `graphs-lockdep` renders `<prev> -> <next>` as text.
  - `a11y.e2e.ts` and `a11y.multi.e2e.ts` find one `main`, a non-empty title and one h1 on every screen, in both themes, on desktop and phone. No screen failed.
  - `contrast.test.ts` passes (45 tests). It reads the pairs from `tokens.css`, and holds the light accent `#ae3f1d`, the `--selection-match` token under ink, muted and accent, and the ink border.
  - `problem.e2e.ts` checks focus after Run, Submit, Reveal hint, both Cancels, a restart and a Language switch, and at 320×256 finds the statement's scroll box 158 px tall (29 px before).
  - `grep -rn "data-sveltekit-noscroll" src` prints nothing.
  - `password.multi.e2e.ts` signs a held Account out from the Change password page at the phone viewport, and a protected page then sends it to Sign in.
- **Release:** this card's merge carries `Release-As: 1.19.6`. The orchestrator then cuts 1.19.6 from release PR #621 and records the cut in `docs/releasing.md`.
- **Reviews:**
  - **The orchestrator's two-reader review** (Fable and Codex) on C349, C351 and C359. None merged until both agreed.
    - **C349** went back once: autolink targets were escaped twice, and three tests did not pin what they named. Neither reader found a way to produce active content or an unsafe URL (Codex ran 8,232 inputs on the final head).
    - **C351** went back once, for tests only: nothing proved the Problem view passed its title.
    - **C359** took five rounds. Each of the first four found something that was then fixed: the test cleanup reset the database but not the running server; a save that committed and then failed left the select on the old mode; an edit made during a save was not restored; and two saves could be in flight at once. The fifth settled a finding that is on `main` and not from the card (without JavaScript, two saves in quick succession are stored in arrival order): it is #647, and both readers agreed the PR itself introduces nothing.
  - **No `sandbox-security-reviewer`:** no card touched `src/lib/server/runner/`.
- **Flakes:** three.
  - **The Submit test's "Submitting" assertion** failed on `main` twice (be5e0a7, 8083e9e). C350 had added it, and it raced the Verdict. Filed as #631, cut into the sprint as C385 under the critical rule, and fixed by holding the request until the state is seen.
  - **`change-password.test.ts`'s eight-changes test** timed out once in `unit` on 3d11edf; re-run. It is #634, in the Backlog.
  - **`.github/ci-gate.test.sh`** failed once in `lint` on PR #644 and passed on a re-run. It is #651, in the Backlog.
- **Decisions and accepted changes from the cards:**
  - **The Backlog rule** (the maintainer, 2026-11-11, #625): nothing is wontfix for being only a refactor; every open issue has a Backlog ticket; only critical work joins the sprint in progress. The sprint started when the maintainer lifted the hold.
  - **C347:** the Problem screen's `main` is the inner grid of panes, not the whole page, so the app header stays the page's banner. C364 keeps that at the short phone with a plain wrapper that scrolls.
  - **C349:** three Chapters' rendered text changed, not two: `two-pointers-go-compact` also had text swallowed as a tag.
  - **C351:** the match is on the heading's Markdown source. A heading written with an entity keeps both h1s; no content file does that today.
  - **C355:** "signed out" is announced by the existing alert, not by the new live region, so it is not read twice.
  - **C360:** no new copy. The h1 is the message the error carries, so a Locked Topic reads `TopicLocked`, as the default page did. The wording is #643, for the maintainer.
  - **C358:** `docs/agents/design-canvas.md` was added to its Files line, for the `tokens()` block's light accent. The logo files keep `#B4421F`, as F20 says.
  - **C363 and C364** ran in lane B's free slot, since lane B's own cards were done and neither shared a file with C359.
  - **C385:** its "10 times in a row" could not be run as written, because the test solves the Problem and a repeat on the same database fails later for that reason. The assertion it fixes passed in every iteration.
  - **Design cards:** F20, F21, P12, S3 and AC3 are on the canvas (version 64). No board was rendered and looked at; the designers checked geometry by arithmetic.
- **Filed during the sprint, in the Backlog:** #623 and #624 (the two lines of the removed candidates file), #634, #637, #640, #643 (`needs-triage`), #647 (`needs-triage`), #649, #651 and #652.
- **Waiting on the maintainer:**
  - **#643:** the 403 and 404 wording on the error page.
  - **#647:** whether the Registration action gets a server-side guard against two saves, and which kind.
  - **#529:** axe is a new dependency, a hard call.
  - **#535:** the Tailscale OAuth client, and a GitHub App or RELEASE_PAT (C220, C221, C340).
  - **Auto-intake:** a hook on the Hermes host, or a workflow with a `project`-scoped token, to create a Backlog ticket when an issue opens. Until then the orchestrator does it each round.
  - **GitGuardian:** 39252375, 39260283 and 39899211 are false positives only the maintainer can mark.
