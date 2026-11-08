# CI credentials

For the maintainer. Every credential CI uses, where it is read, and the steps to replace two of them: the Tailscale auth key with an OAuth client (part 1), and `RELEASE_PAT` with a GitHub App (part 2). Everything on this page is done in the Tailscale and GitHub web consoles by the maintainer; no agent holds these credentials.

This page changes no workflow and no secret. The workflow changes come on their own cards: C216 adds `oauth-secret` beside `authkey`, C220 removes `authkey`, and C221 switches release-please to the App.

## The secrets

Repository secrets live at Settings > Secrets and variables > Actions. A workflow run started by a fork's pull request gets none of them.

| Secret | Read by | Who can trigger that workflow |
| --- | --- | --- |
| `TS_AUTHKEY` | `notify.yml` ("Join tailnet") and `release.yml` (`publish-release`, "Join tailnet to notify the release webhook"). The old way in to the tailnet; part 1 retires it. | `notify.yml` runs on a push to `main`, a merged pull request, a `ci` run finishing on `main`, a 30-minute schedule, and an issue opened or closed by **any GitHub account**. `release.yml` runs only on a push to `main`, so only someone who can merge. |
| `TS_OAUTH_SECRET` | Not read yet. C216 makes both joins above read it; the maintainer adds it in part 1. | The same two workflows. |
| `WEBHOOK_SECRET` | `notify.yml` and `release.yml`, to sign the body of each POST to the maintainer's Hermes host (HMAC-SHA256, `X-Hub-Signature-256`). | The same two workflows. Because an issue run gets this secret, `notify.yml` sends an issue's title only for an OWNER, MEMBER or COLLABORATOR (C214). |
| `RELEASE_PAT` | `release.yml`, the two `release-please` steps (`token:`). A fine-grained token for this repo only, with a short expiry, so the release PR it opens runs the required checks. | A push to `main`. |

`GITHUB_TOKEN` is not on this list: it is the built-in token, and each workflow names its permissions. `ci.yml` uses it to log in to `ghcr.io` in `publish-sandbox` and `publish-edge`.

## Part 1: Tailscale OAuth client (maintainer only)

Why move: `tailscale/github-action` prints a deprecation warning for `authkey` (v4.3.0 and v4.4.0). There is a second reason. On the `authkey` path the action ignores its `tags` input (`tag:ci`) in both versions, so the node's tags, and whether it is ephemeral, come only from how `TS_AUTHKEY` was minted. On the OAuth path the action applies `tags` and joins with `?preauthorized=true&ephemeral=true`, so the workflow, not the key, decides.

**Before you create the client: what it can do if it leaks.** An OAuth client secret never expires. With the `auth_keys` scope and `tag:ci`, whoever holds it can keep minting auth keys for `tag:ci` until the client is revoked. Those include persistent, preauthorized keys: the workflow's `ephemeral=true` binds only the workflow's own join. An auth key, by contrast, expires within 90 days.

`notify.yml` runs, with this secret, on an issue that any GitHub account opens. It runs no checked-out code, and C214 keeps an outsider's text out of its payload. The secret is still exposed to every such run.

So the client is worth having only with these three:
- **Limit what `tag:ci` can reach.** In the tailnet policy file, grant `tag:ci` only the Hermes host's port 8644. Give it nothing else, and no SSH. Then a stolen key reaches one port on one machine.
- **Rotate it.** Generate a new client (steps 1 to 4), replace `TS_OAUTH_SECRET`, check the next `notify` run joins, then revoke the old client (Settings > OAuth clients). Do it on a schedule you choose, and whenever the repository's secrets may have been exposed.
- **If it may have leaked,** revoke the client first. Then, in the Machines list, remove every `tag:ci` device that is not a running CI job, and check the auth keys page for keys you did not mint.

1. In the Tailscale admin console, open Settings > OAuth clients ([Tailscale: OAuth clients](https://tailscale.com/s/oauth-clients)) and generate a client.
2. Give it the `auth_keys` scope with write access, and the tag `tag:ci`. Add no other scope or tag. `tag:ci` must already exist in the tailnet policy file with the maintainer as its owner.
3. Copy the client secret when it is shown (it is shown once). It begins `tskey-client-`.
4. In the repository, add it as the secret `TS_OAUTH_SECRET`.
5. After C216 has merged, check the next `notify` run: its "Join tailnet" step must succeed, and the node must appear in the Machines list tagged `tag:ci` and be removed when the job ends (ephemeral). `notify` runs every 30 minutes, so the check does not wait for an event.
6. Tell the orchestrator. C220 then removes `authkey` from both workflows, which also silences the warning.
7. After C220 has merged and one run has joined, delete the secret `TS_AUTHKEY` and revoke the old auth key in the admin console (Settings > Keys).

The action's inputs: [tailscale/github-action](https://github.com/tailscale/github-action).

## Part 2: a GitHub App for release-please (the maintainer's decision, #535)

Today release-please opens the release PR with `RELEASE_PAT`, not the built-in token, because a PR the built-in token opens triggers no workflows and the `main` ruleset requires those checks. A GitHub App installation token does trigger them.

**What it changes**
- It has its own rate limit. `RELEASE_PAT` is the maintainer's account, so it shares one GraphQL budget with every other tool on that account; that failed release-please twice.
- It has no PAT expiry to remember.
- Its permissions are named in the workflow (`permission-*` inputs), not inherited from a token's settings.
- The PRs it opens still trigger workflows.

**What it costs**
- A new action, `actions/create-github-app-token`, pinned by full SHA in C221.
- A long-lived App private key stored as a secret, in place of a short-lived PAT.

**Repository permissions the App needs.** They come from what `release.yml`'s release-please steps use, and match release-please-action v5.0.0's README ("Workflow Permissions": `contents: write`, `issues: write`, `pull-requests: write`):

| Permission | Level | Why |
| --- | --- | --- |
| Contents | Read and write | Branch for the release PR, the tag and the release, `CHANGELOG.md` and the manifest. |
| Pull requests | Read and write | Open and update the release PR. |
| Issues | Read and write | release-please's labels (`autorelease: pending`, `autorelease: tagged`). |
| Metadata | Read | Always granted. |

Nothing else: no Actions, Administration, Workflows or organization permission, and no webhook (untick "Active").

Docs, at the pinned versions:
- [release-please-action v5.0.0 README](https://github.com/googleapis/release-please-action/blob/v5.0.0/README.md), "Workflow Permissions" and "GitHub Credentials".
- [actions/create-github-app-token v3.3.0 README](https://github.com/actions/create-github-app-token/blob/v3.3.0/README.md): the `client-id` and `private-key` inputs, and `permission-<name>` to narrow the token.

**Steps**
1. GitHub > Settings > Developer settings > GitHub Apps > New GitHub App. Name it (for example `beyondleetcode-release`), set any homepage URL, untick Webhook > Active, set the four permissions above, and "Only on this account".
2. Create it, then note its **Client ID** (General page).
3. Generate a private key (General > Private keys). A `.pem` downloads; keep it only until step 5.
4. Install the App (Install App in the sidebar) on this repository only, not "All repositories".
5. In the repository, add the variable `RELEASE_APP_CLIENT_ID` (Settings > Secrets and variables > Actions > Variables) with the Client ID, and the secret `RELEASE_APP_PRIVATE_KEY` with the whole contents of the `.pem`, then delete the file from disk.
6. Check Settings > Actions > General > "Allow GitHub Actions to create and approve pull requests", which release-please-action's README says it may need.
7. Tell the orchestrator. C221 is the switch: it adds the token step to `release.yml`, points both release-please steps at it, and after one good run the maintainer deletes `RELEASE_PAT`. Until then `RELEASE_PAT` stays in use and in this table.

To rotate the key later, generate a new one, replace `RELEASE_APP_PRIVATE_KEY`, then delete the old key in the App's page.
