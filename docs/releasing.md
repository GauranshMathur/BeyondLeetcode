# Releasing

**One release per sprint.** A sprint is the unit of release: it ends with a single release, cut by the orchestrator at the sprint's exit. The orchestrator chooses its version when it constructs the sprint (`docs/agents/board.md`, Constructing a sprint), and the sprint's last card sets it with a `Release-As` footer. Nothing merges the release PR automatically. release-please (`.github/workflows/release.yml`) only opens and refreshes the release PR, with `RELEASE_PAT` (the CI credentials and how to replace it: [`ci-credentials.md`](ci-credentials.md)), so the required checks run on it. Versions stay 1.x.

Every commit merged to main joins the open release PR, so whatever merges between two cuts (a card, a plan PR, the record of the last cut) ships in the next sprint's release.

## The version

The orchestrator picks it when it constructs the sprint, from the previous sprint's version:

- the next minor if any card in the sprint is `feat`;
- otherwise the next patch.

The commit types are in `docs/agents/board.md`'s Commit types section. The version is written in the sprint's section in `docs/sprints.md`, in its Release option's name and in Planned releases below. It stays fixed for the sprint. A card added later (a split, a new finding) joins the sprint's Release without moving it, unless the maintainer re-plans.

## The Release field

The board's `Release` field (id `PVTSSF_lAHOAm0pms4Bk1LBzhniiDY`) has one option per sprint, named `R vX.Y.Z: Sprint N · <Theme>`, with the description `Sprint N. Cut at the sprint's exit. See docs/releasing.md.` Every card in a sprint has its sprint's Release. The option keeps its name when the release is cut: the record below says which ones are cut.

| Option | Option id |
| --- | --- |
| `R v1.19.0: Sprint 13 · Foundations` | `5eb8b28c` |
| `R v1.19.1: Sprint 14 · Identity` | `528cefdd` |
| `R v1.19.2: Sprint 15 · Screens and phones` | `acb16cb6` |
| `R v1.19.3: Sprint 16 · Languages and the Learning core` | `07c751bf` |
| `R v1.19.4: Sprint 17 · Runner and CI hardening` | `ece5dfa8` |
| `R v1.19.5: Sprint 18 · Submission, Runner and Identity seams` | `d6739981` |
| `R v1.19.6: Sprint 19 · Accessibility` (renamed 2026-11-10; was `Runner and the Build`) | `ba3b24a7` |
| `R v1.19.7: Sprint 20 · Drifted rules and docs` (renamed 2026-11-10; was `Identity forms and policy`) | `41225006` |
| `R v1.20.0: Sprint 21 · The guide, leftover bugs and CI gates` (renamed 2026-11-14 at the sprint's start; was `R v1.20.1: Sprint 22 · Leftover bugs and CI gates`) | `30fe09ec` |
| `R v1.21.0: Sprint 22 · Dev mode` (renamed 2026-11-16 when the starting Language moved to Sprint 23; was `R v1.21.0: Sprint 22 · Dev mode and the starting Language`) | `647d8bbc` |
| `R v1.22.0: Sprint 23 · The starting Language` (renamed 2026-11-16; was `R v1.21.1: Sprint 23 · Unplanned`) | `59e6d8b2` |
| `R v1.21.1: Sprint 24 · Proof and operator checks` (added 2026-11-18) | `cb16e1c5` |

The two options for Sprints 21 and 22 swapped numbers on 2026-11-14: the sprint that waits on nobody runs first, and each option kept its cards.

A content sprint (`docs/sprints.md`, The content sprints) has a Sprint option and no Release option: its PRs ship in the app release open when they merge. A content card that is `feat` makes that release a minor one.

## Planned releases

The orchestrator adds a row for each sprint it constructs.

| Sprint | Release option | Version | State |
| --- | --- | --- | --- |
| 13 · Foundations | `R v1.19.0: Sprint 13 · Foundations` | 1.19.0 | cut 2026-10-28 |
| 14 · Identity | `R v1.19.1: Sprint 14 · Identity` | 1.19.1 | cut 2026-11-04 |
| 15 · Screens and phones | `R v1.19.2: Sprint 15 · Screens and phones` | 1.19.2 | cut 2026-11-05 |
| 16 · Languages and the Learning core | `R v1.19.3: Sprint 16 · Languages and the Learning core` | 1.19.3 | cut 2026-11-05 |
| 17 · Runner and CI hardening | `R v1.19.4: Sprint 17 · Runner and CI hardening` | 1.19.4 | cut 2026-11-08 |
| 18 · Submission, Runner and Identity seams | `R v1.19.5: Sprint 18 · Submission, Runner and Identity seams` | 1.19.5 | cut 2026-11-11 |
| 19 · Accessibility | `R v1.19.6: Sprint 19 · Accessibility` | 1.19.6 | cut 2026-11-11 |
| 20 · Drifted rules and docs | `R v1.19.7: Sprint 20 · Drifted rules and docs` | 1.19.7 | cut 2026-11-14 |
| 21 · The guide, leftover bugs and CI gates | `R v1.20.0: Sprint 21 · The guide, leftover bugs and CI gates` | 1.20.0 | cut 2026-11-16 |
| 22 · Dev mode | `R v1.21.0: Sprint 22 · Dev mode` | 1.21.0 | cut 2026-11-16 |
| 23 · The starting Language | `R v1.22.0: Sprint 23 · The starting Language` | 1.22.0 | planned 2026-11-16 (minor: its cards are `feat`); starts when the maintainer has answered #661 |
| 24 · Proof and operator checks | `R v1.21.1: Sprint 24 · Proof and operator checks` | 1.21.1 | cut 2026-11-18 |

## The last card

Every sprint ends with one card the orchestrator files when it constructs the sprint: `[Cnnn] Sprint N: exit check and Release-As X.Y.Z`, commit type `docs`. It is worked last, when every other card in Sprint N is Done, and the orchestrator works it itself. It checks the sprint's exit criteria and writes the sprint's Status in `docs/sprints.md`. The Status counts issues closed as well as cards done, each per tier (`docs/agents/board.md`, Issues are the unit of work, and Tiers). Then it squash-merges that PR with the footer:

```sh
gh pr merge <n> --squash --body $'Sprint N exit check.\n\nRelease-As: X.Y.Z'
```

No other card carries `Release-As`.

Once the cut is recorded, the sprint's section moves to `docs/sprints-archive.md`, so `docs/sprints.md` holds only the current and planned sprints.

## History

- Up to 1.18.0 (#395), `release.yml` merged every release PR itself.
- From C128, the orchestrator cut each Release by hand, once a planned feature set was complete; 1.19.0 was the first.
- From 2026-10-29, the maintainer set one release per sprint, with longer sprints, and a changelog with fixed headings in every release.

## Cutting a sprint's release

Only when every card in the sprint is Done, the last card included, and `ci` is green on main.

1. **Confirm the release PR.** After the last card's push to main, the `release` run leaves one open PR labelled `autorelease: pending`:

   ```sh
   gh pr list --state open --label "autorelease: pending" --json number,title,headRefName,autoMergeRequest
   ```

   The title reads `chore(main): release X.Y.Z`, the sprint's version, and `autoMergeRequest` is `null`. If auto-merge is armed, run `gh pr merge <n> --disable-auto`.
2. **Draft the changelog** from [the template](release-notes-template.md). It has all seven headings, Highlights, Added, Fixed, Changed, Content, Security and Upgrade notes, and the command that lists every PR merged since the previous tag with its `Changelog:` line. Every PR whose line is not `none` gets a bullet. Save it outside the repo as the notes file.
3. **Put it in the release PR.** In a worktree of the release PR's branch, replace everything under its `## [X.Y.Z]` heading in `CHANGELOG.md`, up to the previous version's heading, with the notes file. Keep release-please's heading line, and keep the notes' headings at `###`. Commit as `docs(beyondleetcode): X.Y.Z changelog` and push. `release-gate` allows `CHANGELOG.md` in a release commit.
4. **Review it before merging.** Read the changelog in the PR (`gh pr diff <n>`) against the list from step 2:
   - each PR with a Changelog line has its bullet, under the right heading;
   - all seven headings are there (an empty one says so, as the template shows);
   - it reads well to a user who did not follow the sprint.
5. **Check before merging:**
   - the required checks are green on the release PR's head, which is the changelog commit (a newer push to main makes release-please rewrite the branch: then go back to step 3);
   - no card in the sprint is open: `select(.sprint=="Sprint N · <Theme>" and .status != "Done")` prints nothing;
   - the PR's version is the sprint's version in Planned releases.
   - the PR's body closes only issues that are finished. release-please turns a `Refs #N` or `Closes #N` line in a commit message into "closes #N" in the release PR's body, and GitHub closes that issue when the release PR merges. List them with `gh pr view <n> --json body --jq .body | grep -oE 'closes \[#[0-9]+\]'`; for each issue that must stay open, edit that text out of the PR's body before merging (`gh pr edit <n> --body-file`). #663 was closed this way by the 1.19.7 release and reopened. Issue references belong in a pull request's body, not in a commit message.
6. **Merge**, pinned to the head you checked:

   ```sh
   gh pr merge <n> --squash --match-head-commit <full head sha>
   ```

7. **Watch** the run that the merge pushes to main, through `release-please`, `release-gate` and `publish-release`, including the "Notify release webhook" step:

   ```sh
   gh run list --workflow release --branch main --limit 1 --json databaseId
   gh run watch <run-id> --exit-status --interval 60
   ```

   The image `ghcr.io/gauranshmathur/beyondleetcode` is then published as `vX.Y.Z` and `latest`. The webhook step is non-fatal, so also read its log for a `::warning::`.

   If `release-please` fails with `API rate limit already exceeded`, that is GitHub's GraphQL limit, not the release. `RELEASE_PAT` shares the limit with the orchestrator and its workers. Wait for the limit to reset, re-run only the failed job (`gh run rerun <run-id> --failed`), and watch again. Until the cut is done, watch CI over REST (`gh run watch`, the `check-runs` endpoint) rather than polling `gh pr checks`, which spends the same budget.
8. **Set the same notes on the GitHub release.** release-please writes the release from the PR body, not from `CHANGELOG.md`, and never edits a release it created, so this sticks:

   ```sh
   gh release edit vX.Y.Z --notes-file <notes-file>
   ```

9. **Record the cut**: set the sprint's row in Planned releases to `cut <date>` and add a row below, in a small docs PR. That PR joins the next sprint's release.

## Record of cuts

| Version | Release | Date | Release PR | Completing commit | Notes |
| --- | --- | --- | --- | --- | --- |
| 1.19.0 | `R v1.19.0: Sprint 13 · Foundations` | 2026-10-28 | #403 | 65e6080 (C130, #405), with `Release-As: 1.19.0` | The first release merged by hand. The merge's `release` run tagged `v1.19.0`, passed `release-gate`, published the image as `v1.19.0` and `latest` (one digest), and the webhook answered `delivered`. Notes set from the template. Cut under the old per-feature-set rule, before the changelog went into `CHANGELOG.md`. |
| 1.19.1 | `R v1.19.1: Sprint 14 · Identity` | 2026-11-04 | #407 | 8d4f4ad (C155, #439), with `Release-As: 1.19.1` | The first release with its changelog in `CHANGELOG.md`: the notes went into the release PR as `docs(beyondleetcode): 1.19.1 changelog` (71f96af), were reviewed in the diff, and the PR merged pinned to that head (dfda408). Its `release` run (41888165424) tagged `v1.19.1`, passed `release-gate`, published the image as `v1.19.1` and `latest` (one digest, sha256:93acfb58…), and the webhook answered `delivered`. The same notes are set on the GitHub release. |
| 1.19.2 | `R v1.19.2: Sprint 15 · Screens and phones` | 2026-11-05 | #446 | 73d3cb1 (C177, #467), with `Release-As: 1.19.2` | The notes went into the release PR as `docs(beyondleetcode): 1.19.2 changelog` (d4e9c4e), were reviewed in the diff, and the PR merged pinned to that head (21355c0). Its `release` run (41976170071) tagged `v1.19.2`, passed `release-gate`, published the image as `v1.19.2` and `latest` (one digest, sha256:c35668d9…), and the webhook answered `delivered`. The same notes are set on the GitHub release. Sprint 16's round 1 started before the cut, with every merge held until the tag existed. |
| 1.19.3 | `R v1.19.3: Sprint 16 · Languages and the Learning core` | 2026-11-05 | #476 | d56692a (C196, #497), with `Release-As: 1.19.3` | The notes went into the release PR as `docs(beyondleetcode): 1.19.3 changelog` (ff86b7d), were reviewed in the diff, and the PR merged pinned to that head (5aaa5cb). Its `release` run (42010456406) tagged `v1.19.3`, passed `release-gate`, published the image as `v1.19.3` and `latest` (one digest, sha256:ad463488…), and the webhook answered `delivered`. The same notes are set on the GitHub release. Every PR in it has `Changelog: none`, so its notes are the template's empty lines under a Highlights section. |
| 1.19.4 | `R v1.19.4: Sprint 17 · Runner and CI hardening` | 2026-11-08 | #499 | 98899d1 (C219, #552), with `Release-As: 1.19.4` | The notes went into the release PR as `docs(beyondleetcode): 1.19.4 changelog` (504342e), were reviewed in the diff, and the PR merged pinned to that head (bd8e840). Its `release` run (42495511016) tagged `v1.19.4`, passed `release-gate`, and published the image as `v1.19.4` and `latest` with one digest (`sha256:1d2640f4…`). The webhook answered `delivered`, and the same notes are set on the GitHub release. The run still warns that `authkey` is deprecated, until C220. The first release built with every third-party action pinned by SHA, and the binfmt image pinned by digest (C212). |
| 1.19.5 | `R v1.19.5: Sprint 18 · Submission, Runner and Identity seams` | 2026-11-11 | #554 | fe9009e (C246, #619), with `Release-As: 1.19.5` | The notes went into the release PR as `docs(beyondleetcode): 1.19.5 changelog` (1c74f65), were reviewed in the diff, and the PR merged pinned to that head (f91863d). Its `release` run (42948212334) tagged `v1.19.5`, passed `release-gate`, and published the image as `v1.19.5` and `latest` from one build (`sha256:89c8c369…`). The webhook answered `delivered`, and the same notes are set on the GitHub release. The run still warns that `authkey` is deprecated, until C220. C346's PR said `Changelog: none`; its arm64 `ptrace` fix has a Security bullet anyway, because it closes a sandbox gap (#598) an operator should know about. The first cut whose sprint Status counts issues closed: 16. |
| 1.19.6 | `R v1.19.6: Sprint 19 · Accessibility` | 2026-11-11 | #621 | 64b67ea (C365, #653), with `Release-As: 1.19.6` | The notes went into the release PR as `docs(beyondleetcode): 1.19.6 changelog` (7f747f4), were reviewed in the diff, and the PR merged pinned to that head (2613708). Its `release` run (43050903964) tagged `v1.19.6`, passed `release-gate`, and published the image as `v1.19.6` and `latest` from one build (`sha256:3e34d914…`). The webhook answered `delivered`, and the same notes are set on the GitHub release. The run still warns that `authkey` is deprecated, until C220. PR #627 held two cards, so it has two bullets; C349's fix has a bullet under Content and one under Security. |
| 1.19.7 | `R v1.19.7: Sprint 20 · Drifted rules and docs` | 2026-11-14 | #655 | 76be6d2 (C383, #685), with `Release-As: 1.19.7` | The notes went into the release PR as `docs(beyondleetcode): 1.19.7 changelog` (1ac32d7), were reviewed in the diff, and the PR merged pinned to that head (5441c86). Its `release` run (43633677556) tagged `v1.19.7`, passed `release-gate`, and published the image as `v1.19.7` and `latest` from one build (`sha256:9a80502f…`). The webhook answered `delivered`, and the same notes are set on the GitHub release. The run still warns that `authkey` is deprecated, until C220. C378's PR (#671) said `Changelog: none`; its log lines have a Changed bullet and its redirect hardening a Security bullet, since operators see both. |
| 1.20.0 | `R v1.20.0: Sprint 21 · The guide, leftover bugs and CI gates` | 2026-11-16 | #687 | 0859035 (C412, #715), with `Release-As: 1.20.0` | The notes went into the release PR as `docs(beyondleetcode): 1.20.0 changelog` (9f9c212), were reviewed in the diff, and the PR merged pinned to that head (b2f262b). Its `release` run (43797491810) tagged `v1.20.0` and passed `release-gate`, which for the first time waited on the one `tests` job (C411): its log reads "Waiting for ci run 43797491737: (tests) must succeed" and "Every waited-for job succeeded". `publish-release` then failed once at the push: both architectures built, and GHCR answered `failed to fetch oauth token: denied: denied`, though the job's token had `Packages: write` and its login had succeeded. The orchestrator re-ran the failed job once, the release commit still being main's HEAD; the second attempt published the image as `v1.20.0` and `latest` from one build (`sha256:7f80e160…`). The webhook answered `delivered`, and the same notes are set on the GitHub release. The run still warns that `authkey` is deprecated. The release PR's body had no `closes` line. A minor release: the Guide page and its header link are `feat`. |
| 1.21.0 | `R v1.21.0: Sprint 22 · Dev mode` | 2026-11-16 | #716 | cf414f0 (C403, #732), with `Release-As: 1.21.0` | The notes went into the release PR as `docs(beyondleetcode): 1.21.0 changelog` (6717b39), were reviewed in the diff, and the PR merged pinned to that head (9046992). Its `release` run (43853920523) tagged `v1.21.0`, passed `release-gate` (it waited on the one `tests` job of ci run 43853920566) and published the image as `v1.21.0` and `latest` from one build (`sha256:c30d8ed8…`), on the first attempt. The webhook answered `delivered`, and the same notes are set on the GitHub release. The first cut under the review gate: `review-gate` judged the release PR tier 1 by its release-please exemption, changelog commit included ("a release-please pull request that changes only the release files"). The release PR's body had no `closes` line. A minor release: dev mode is `feat`. The sprint was re-sliced the same day to dev mode alone, so the starting Language is not in it. |
| 1.21.1 | `R v1.21.1: Sprint 24 · Proof and operator checks` | 2026-11-18 | #739 | cd996c7 (C469, #775), with `Release-As: 1.21.1` | The notes went into the release PR as `docs(beyondleetcode): 1.21.1 changelog` (17fd315), were reviewed in the diff, and the PR merged pinned to that head (1ece51b). Its `release` run (44367124601) tagged `v1.21.1`, passed `release-gate` (it waited on the one `tests` job of ci run 44367124898) and published the image as `v1.21.1` and `latest` from one build (`sha256:28f1e47c…`), on the first attempt. The webhook answered `delivered`, and the same notes are set on the GitHub release. The run still warns that `authkey` is deprecated. The release PR's body had no `closes` line. A patch release: no card is `feat`. Five PRs had a Changelog line; C465's (#753) is under Security, since it stops a Docker daemon's reply reaching the Runner's log. |
