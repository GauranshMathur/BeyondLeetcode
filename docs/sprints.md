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

## After each build sprint

Code cards for Sprints 2–5 come from the spec via `to-tickets` when the sprint starts. When a sprint's features land, `improve-codebase-architecture` turns friction into `architecture` issues for later.
