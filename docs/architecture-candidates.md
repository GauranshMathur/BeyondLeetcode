# Architecture candidates

The architecture review after each released sprint (`docs/agents/board.md`, After a major feature) files an issue only for a bug, a security problem, or something that blocks a planned feature (the maintainer's rule, 2026-11-10). Every other finding goes on this list instead, one line each with its files.

Nothing here is planned into a sprint unless the maintainer picks it. A picked candidate becomes an issue, then cards, and leaves this list.

Format: `- <finding, in one line> — <files> — <review and date> (<the issue it came from, if any>)`

## Candidates

The re-triage of the open `architecture` issues against this rule (2026-11-10) is with the maintainer. The findings of the issues the maintainer closes as wontfix move here.

- The Main Line, its places and the Topic Map are computed only inside `loadCatalogue`, so every in-memory catalogue re-derives them: split out a pure indexer ("index content into a Catalogue") that the file reader, `rules.test.ts` (its `placeOf` and `catalogueOf` copies) and the scripted Runner all build through — `src/lib/server/content/catalogue.ts`, `src/lib/server/learning/rules.test.ts`, `src/lib/server/runner/scripted-catalogue.ts` — Sprint 17 architecture review, finding 26, 2026-11-10 (#517's larger step; its bug, the fake, is C381 in Sprint 20)
- The Admin actions object answers refusal codes, but the free `listAccounts`, `resetPassword` and `removeAccount` it wraps still throw five exported error classes (`NotAdminError`, `UnknownAccountError`, `SelfResetError`, `SelfRemoveError`, `ProgressNotRemovedError`) and have no role check of their own: make them private behind the Admin actions and answer codes directly, which rewrites about 40 calls in `accounts.test.ts` and `session-binding.test.ts` — `src/lib/server/identity/accounts.ts`, `src/lib/server/identity/accounts.test.ts`, `src/lib/server/identity/session-binding.test.ts` — Sprint 18, C238's two-reader review, 2026-11-10 (#512)
