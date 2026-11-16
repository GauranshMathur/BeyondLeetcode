# Decisions

One line for every Blocked question answered below the maintainer (`docs/agents/board.md`, Escalation ladder): at rung a by the card-reviewer, from what is already written, or at rung b by the principal, with an ADR in `docs/adr/`. The maintainer can overrule any line.

A question that reaches the maintainer (rung c) is not recorded here: its answer goes on the issue and the card.

Format, newest last:

`date · card · question · answer · who decided`

| Date | Card | Question | Answer | Who decided |
|---|---|---|---|---|
| 2026-11-16 | C391 | Does each reference-run result carry its Problem's id? | Yes: Test names repeat across the Problems a Submit covers, and a Submit's failure already names the Problem, Hidden included (`catalogue.ts`, `submit-plan.ts`, `submission.ts`) | card-reviewer |
| 2026-11-16 | C391 | What does a reference run answer for a cut-off batch or a Runner answer missing a Test? | `RunnerUnavailable`, as for a Run and a Submit (the card; `docs/module-map.md`) | card-reviewer |
| 2026-11-16 | C391 | What does a Hidden Test's result hold in a dev-mode reference run? | Its name, that it is Hidden, and the outcome, nothing else (the card's Rule 4; `CONTEXT.md`, Test) | card-reviewer |
| 2026-11-16 | C394 | Is the region named "Dev mode: run the reference solution" the band or the whole Dev view? | The band only; the status and the results sit outside it (the card's step 4; the P13 board) | card-reviewer |
| 2026-11-16 | C389 | How is "dev mode is never on a Multi-user Instance" held when a Local Instance is converted while it runs? | The conversion is refused while dev mode is on, by the Instance module, for every caller; restart without the switch to convert | the orchestrator, during C389's security review; that was the wrong rung (the Sprint 22 audit). The principal confirms where the rule is held, by ADR 0006's amendment of 2026-11-16 |
| 2026-11-16 | C389 | Is dev mode on for a fresh Instance started with the switch? | No: only for an Instance that is already Local when the process starts, so choosing Local at Setup needs a restart to turn it on. Whether that restart is acceptable for an operator is open; issue 735 carries it | the builder, on C389; kept through review and recorded here, not decided at a rung |
| 2026-11-16 | C439 | What tolerance does the fork-bomb test's "destroyed before the Runner answered" check allow, and why? | 50 ms, compared without rounding. The fault it guards against leaves the destroy seconds late when the hard stop fired, and Docker's AutoRemove removes a container that ended by itself within milliseconds either way | the orchestrator, with both reviewers' analysis |
