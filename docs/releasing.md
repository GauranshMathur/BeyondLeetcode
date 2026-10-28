# Releasing

Releases are cut by the orchestrator, by hand, when a planned feature set is complete. Nothing merges the release PR automatically. release-please (`.github/workflows/release.yml`) only opens and refreshes the release PR, with `RELEASE_PAT`, so the required checks run on it. Versions stay 1.x.

## The Release field

The board's `Release` field (id `PVTSSF_lAHOAm0pms4Bk1LBzhniiDY`) has one option per planned release, named `R next: <name>`. When the release is cut, rename the option to `R vX.Y.Z: <name>`. Renaming keeps the option id, so its cards keep the record.

| Option | Option id |
| --- | --- |
| `R next: Foundations` | `5eb8b28c` |

## Planned releases

The `sprint-planner` agent (C127) adds future Releases here.

| Release | Feature set | Target version |
| --- | --- | --- |
| `R next: Foundations` | F17, C124, C125, C126, C127, C128, C129, C130 | **1.19.0** |

Foundations is the next minor after 1.18.0. Only C124 (`feat`, the favicon) adds a user-visible change; the rest are `docs` or `ci`, so the version needs the `Release-As` footer below.

## History

Up to 1.18.0 (#395), `release.yml` merged every release PR itself. From C128 on, the orchestrator cuts each Release.

## Cutting a Release

Only when every card in the Release is Done and `ci` is green on main.

1. Set the version. The commit that completes the feature set carries a `Release-As: X.Y.Z` footer, which release-please reads. When squash-merging that card's PR:

   ```sh
   gh pr merge <n> --squash --body $'<summary>\n\nRelease-As: 1.19.0'
   ```

2. Confirm the release PR. After the push to main, the `release` run leaves one open PR labelled `autorelease: pending`. Check its title and version:

   ```sh
   gh pr list --state open --label "autorelease: pending" --json number,title,autoMergeRequest
   ```

   The title reads `chore(main): release X.Y.Z`, and `autoMergeRequest` is `null`. If auto-merge is armed, run `gh pr merge <n> --disable-auto`.
3. Check before merging:
   - the required checks are green on the release PR;
   - the changelog reads well and carries each card's Changelog line;
   - no open card has that Release;
   - the version matches the target in this file.
4. Merge:

   ```sh
   gh pr merge <n> --squash
   ```

5. Watch the run that the merge pushes to main, through `release-please`, `release-gate` and `publish-release`, including the "Notify release webhook" step:

   ```sh
   gh run list --workflow release --branch main --limit 1 --json databaseId
   gh run watch <run-id> --exit-status --interval 60
   ```

   The image `ghcr.io/gauranshmathur/beyondleetcode` is then published as `vX.Y.Z` and `latest`. The webhook step is non-fatal, so also read its log for a `::warning::`.
6. Rename the Release option to `R vX.Y.Z: <name>` and add a row to the record below.

## Record of cuts

| Version | Release | Date | Release PR | Completing commit | Notes |
| --- | --- | --- | --- | --- | --- |
