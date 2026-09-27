# BeyondLeetcode

Content a learner reads or solves (chapters, problems, tests, hints, card text) must meet `docs/content-standards.md`: primary sources, human-verified.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on GauranshMathur/BeyondLeetcode via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Board

Planned work is tracked as cards on a GitHub Project board, run by dispatching subagents in parallel lanes. See `docs/agents/board.md` before picking up, dispatching or adding a card.

### Triage labels

Default five-role vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `CONTEXT.md` plus `docs/adr/`. See `docs/agents/domain.md`.
