# Accounts link to Learners; the mode lives in the database

Progress belongs to a Learner, not to an Account. Every Account points at one Learner; Local Mode has one Learner, `local`, and no Accounts. When a Local Instance is switched to Multi-user, the first admin's Account is linked to the existing `local` Learner, so their progress does not move. Every later Account gets a new Learner.

The Instance mode (`local` or `multi`) and the Registration Mode (`open` or `invite`) are rows in the database, written once through one module. Each web process reads them at start and holds them in memory, so an Instance runs exactly one web process per data volume: a second process keeps the mode it read and can serve the wrong thing after a switch. An unknown stored Registration Mode reads as invite-only.

An Invite is claimed (spent) before any Account or Learner row is written. A failed sign-up after the claim does not restore the Invite, so one link can never make two Accounts. Rows of progress carry a foreign key to the Learner with cascade (C56), so removing an Account removes its Learner and everything that belongs to it, and the database refuses progress for a Learner that does not exist.

## Considered Options

- **Progress keyed by Account:** rejected. Local progress would have to be copied or re-keyed on the switch, and Local Mode would need a fake Account.
- **The mode in an environment variable:** rejected. Switching would need the operator to edit files and restart; a stored mode lets Setup and Settings do it, and an Instance cannot be flipped by changing a variable by accident.
- **Check the mode in the database on every request:** rejected for MVP1. One read per request is not worth it for a single-process Instance; the cost is the one-process rule above.

## Consequences

The README tells operators to run one web process per data volume and to restart every web process after a switch. The `reset-admin-password` command writes to the database directly, so it must not run while someone is setting up or switching. A migration that adds the Learner foreign keys stops with a named error if one provider identity belongs to two Users; the operator resolves it by hand (README, Upgrading).
