# Release notes template

The orchestrator fills this in for each release, from the `Changelog:` line of every card PR in the Release, and sets the result on the GitHub release (`docs/releasing.md`). Delete every hint line, and remove any heading with nothing under it, before publishing. `CHANGELOG.md` is separate: release-please writes it from commit subjects.

## List the Release's cards and their Changelog lines

```sh
# Cards with the Release (replace the name with the option, e.g. "R next: Foundations")
gh project item-list 1 --owner GauranshMathur --limit 500 --format json \
  --jq '.items[] | select(.release=="R next: Foundations") | {title, status}'

# Cards with the Release that are not Done (the cut needs this to print nothing)
gh project item-list 1 --owner GauranshMathur --limit 500 --format json \
  --jq '.items[] | select(.release=="R next: Foundations" and .status != "Done") | .title'

# One card PR's Changelog line (the PR number is in the squash commit subject, "(#n)")
gh api repos/GauranshMathur/BeyondLeetcode/pulls/<n> --jq .body | grep '^Changelog:'
```

## Template

```markdown
## Highlights

_Two or three lines on what matters most in this release, for a reader who stops here._

## Added

_New features a user can see or use, one line each._

## Fixed

_Bugs fixed, one line each, in the user's terms._

## Changed

_Behaviour, design or tooling that works differently now._

## Content (new Topics and Chapters)

_Each new Topic or Chapter by name, with its Topic._

## Security

_Security fixes and hardening, or remove this heading._

## Upgrade notes

_Anything an operator must do or know when deploying: config, env, data, breaking changes._
```
