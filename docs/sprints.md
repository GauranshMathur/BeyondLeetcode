# Sprints

Sprints are goal-based, not time-boxed: a sprint ends when its exit criteria hold. Every card carries a Sprint field on the board (IDs in `docs/agents/board.md`). The orchestrator works one sprint at a time and does not pull cards from a later sprint until the current one exits.

**Size and release** (from Sprint 14). A sprint is one coherent theme drawn from the open issues, typically 12 to 25 cards; each card is still one PR. A sprint is the unit of release: it ends with one release, whose version the `sprint-planner` picks when it plans the sprint and whose last card sets it with `Release-As`. Its changelog has fixed headings and is reviewed before the release PR merges (`docs/releasing.md`).

**Ordering rule.** Each screen is designed in the sprint that builds it, or the one just before. Foundations rules come first so every later screen is built responsive from day one. The one exception is mobile boards, which wait for Sprint 5.

**Only the current and planned sprints** (the maintainer's rule, 2026-11-10). When a sprint exits, its last card moves the sprint's section, its Status included, to `docs/sprints-archive.md`, which holds Sprints 0 to 19.

**The Backlog** (the maintainer's decision, 2026-11-11). Every open issue has a ticket on the board with Status Backlog and no sprint. The planner pulls from the Backlog by priority when it plans the next sprints. Only critical work joins the sprint in progress: a bug that hurts users, a security problem, a broken CI or release, or something a planned card cannot be built without. The rules are in `docs/agents/board.md`, Issues are the unit of work.

**Issues first** (the maintainer's rule, 2026-11-10, #591). Each sprint plans issues, and its cards say how each issue is done. Each sprint's section lists issue → cards, with the last card that closes each issue. The rules are in `docs/agents/board.md`, Issues are the unit of work.

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
