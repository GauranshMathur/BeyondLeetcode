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
