# Releasing

**One release per sprint.** A sprint is the unit of release: it ends with a single release, cut by the orchestrator at the sprint's exit. The `sprint-planner` chooses its version when it plans the sprint, and the sprint's last card sets it with a `Release-As` footer. Nothing merges the release PR automatically. release-please (`.github/workflows/release.yml`) only opens and refreshes the release PR, with `RELEASE_PAT`, so the required checks run on it. Versions stay 1.x.

Every commit merged to main joins the open release PR, so whatever merges between two cuts (a card, a plan PR, the record of the last cut) ships in the next sprint's release.

## The version

The planner picks it at the sprint's start, from the previous sprint's version:

- the next minor if any card in the sprint is `feat`;
- otherwise the next patch.

The commit types are in `docs/agents/board.md`'s Commit types section. The version is written in the sprint's section in `docs/sprints.md`, in its Release option's name and in Planned releases below. It stays fixed for the sprint. A card added later (a split, a new finding) joins the sprint's Release without moving it, unless the maintainer re-plans.

## The Release field

The board's `Release` field (id `PVTSSF_lAHOAm0pms4Bk1LBzhniiDY`) has one option per sprint, named `R vX.Y.Z: Sprint N · <Theme>`, with the description `Sprint N. Cut at the sprint's exit. See docs/releasing.md.` Every card in a sprint has its sprint's Release. The option keeps its name when the release is cut: the record below says which ones are cut.

| Option | Option id |
| --- | --- |
| `R v1.19.0: Sprint 13 · Foundations` | `5eb8b28c` |

## Planned releases

The `sprint-planner` adds a row for each sprint it plans.

| Sprint | Release option | Version | State |
| --- | --- | --- | --- |
| 13 · Foundations | `R v1.19.0: Sprint 13 · Foundations` | 1.19.0 | cut 2026-10-28 |

## The last card

Every sprint ends with one card the planner files: `[Cnnn] Sprint N: exit check and Release-As X.Y.Z`, commit type `docs`, `Blocked by: every other card in Sprint N`. The orchestrator works it itself: it checks the sprint's exit criteria, writes the sprint's Status in `docs/sprints.md`, and squash-merges that PR with the footer:

```sh
gh pr merge <n> --squash --body $'Sprint N exit check.\n\nRelease-As: X.Y.Z'
```

No other card carries `Release-As`.

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
8. **Set the same notes on the GitHub release.** release-please writes the release from the PR body, not from `CHANGELOG.md`, and never edits a release it created, so this sticks:

   ```sh
   gh release edit vX.Y.Z --notes-file <notes-file>
   ```

9. **Record the cut**: set the sprint's row in Planned releases to `cut <date>` and add a row below, in a small docs PR. That PR joins the next sprint's release.

## Record of cuts

| Version | Release | Date | Release PR | Completing commit | Notes |
| --- | --- | --- | --- | --- | --- |
| 1.19.0 | `R v1.19.0: Sprint 13 · Foundations` | 2026-10-28 | #403 | 65e6080 (C130, #405), with `Release-As: 1.19.0` | The first release merged by hand. The merge's `release` run tagged `v1.19.0`, passed `release-gate`, published the image as `v1.19.0` and `latest` (one digest), and the webhook answered `delivered`. Notes set from the template. Cut under the old per-feature-set rule, before the changelog went into `CHANGELOG.md`. |
