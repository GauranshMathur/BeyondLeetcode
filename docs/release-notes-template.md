# Release notes template

The orchestrator fills this in at each sprint's exit, from the `Changelog:` line of every PR merged since the previous release. The result is the release's changelog: it replaces release-please's section in the release PR's `CHANGELOG.md`, where it is reviewed before the merge, and the same text is set on the GitHub release (`docs/releasing.md`, Cutting a sprint's release).

Keep all seven headings, in this order, at `###`. Replace each hint line with bullets, or, where a heading has nothing, with the line shown after the hint.

## List what the release holds

```sh
# Every PR merged since the previous release, with its Changelog line ("MISSING" means the PR has none)
prev="$(gh release view --json tagName --jq .tagName)"
git fetch -q origin main
git log --format='%s' "$prev"..origin/main | grep -oE '\(#[0-9]+\)$' | tr -d '(#)' | while read -r n; do
  gh api "repos/GauranshMathur/BeyondLeetcode/pulls/$n" \
    --jq '(.body // "" | [scan("(?m)^Changelog:[ \\t]*(.*)$")] | first // ["MISSING"] | .[0]) as $c | "#\(.number) \(.title) | \($c)"'
done

# The sprint's cards that are not Done (the cut needs this to print nothing)
gh project item-list 1 --owner GauranshMathur --limit 500 --format json \
  --jq '.items[] | select(.sprint=="Sprint 14 · <Theme>" and .status != "Done") | .title'
```

Each line goes under one heading, by its PR's commit type and what it changes:

| Heading | Takes |
| --- | --- |
| Added | `feat`: a new feature a user can see or use. |
| Fixed | `fix`: a bug a user would notice, in their terms. |
| Changed | Anything else with a Changelog line: behaviour, design, docs or tooling that works differently now. |
| Content | Topics, Chapters and Problems added or corrected, by name, with their Topic. |
| Security | Security fixes and hardening (`fix` cards that close a hole or tighten a rule). |
| Upgrade notes | What an operator must do or know when deploying: config, env, data, breaking changes. |

A line written as `Changelog: none` gets no bullet. A PR with no line at all is a gap: read the PR and write its bullet.

## Template

```markdown
### Highlights

_Two or three lines on what matters most in this release, for a reader who stops here._

### Added

_New features a user can see or use, one line each, with the card and PR: (C140, #420)._
Nothing new to use in this release.

### Fixed

_Bugs fixed, one line each, in the user's terms._
No bug fixes in this release.

### Changed

_Behaviour, design, docs or tooling that works differently now._
Nothing changed in how it works.

### Content

_Each new or corrected Topic, Chapter or Problem by name, with its Topic._
No content changes in this release.

### Security

_Security fixes and hardening._
No security changes in this release.

### Upgrade notes

_Anything an operator must do or know when deploying: config, env, data, breaking changes._
Nothing to do. Pull `vX.Y.Z` or `latest`.
```
