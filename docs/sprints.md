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

## After each build sprint

Code cards for Sprints 2–5 come from the spec via `to-tickets` when the sprint starts. When a sprint's features land, `improve-codebase-architecture` turns friction into `architecture` issues for later.
