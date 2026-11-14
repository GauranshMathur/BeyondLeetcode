# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Tiers

Triage gives every issue exactly one tier label, with a one-line reason in the issue (`board.md`, Tiers, which holds the rules):

| Label | Tier |
| --- | --- |
| `tier-0` | Tier 0 critical fixes: bugs that hurt users, security problems, broken CI or release. |
| `tier-1` | Tier 1 priority: the maintainer's new items, accessibility that blocks users, and anything that unblocks them. |
| `tier-2` | Tier 2 normal work. |
| `tier-3` | Tier 3 refactors and tidy-ups, drawn from only when a sprint has room. |

The label `priority` marks the maintainer's own new items, which are Tier 1. Whoever files an issue proposes its tier; triage confirms it. A Tier 0 issue joins the current sprint at once.

## Intake

Triage assigns the tier, then ends with the issue's ticket on the board, its `Tier` field set (`board.md`, Issues are the unit of work, Intake): a draft item `[#N] <title>` with Status Backlog, the `Issue` field and a `Refs #N` line. No issue is labelled `wontfix` because it is only a refactor. `wontfix` is the maintainer's label.
