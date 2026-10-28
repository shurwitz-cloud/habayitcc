# Privacy gate

Personal data (member emails, names, phone numbers, addresses, family
invoice details) and secrets must never enter this repository.

## What exists

- `scripts/prepush-privacy-gate.sh` - scans the FULL TREE of every commit a
  push would publish (not just the net diff) for personal-email patterns,
  secret patterns, and a privately maintained marker list. Exit 1 blocks.
- `.github/workflows/privacy-gate.yml` - runs the same scan in CI on every
  push and PR.

## Fresh clone / Cursor setup (do this once)

    cp scripts/prepush-privacy-gate.sh .git/hooks/pre-push
    chmod +x .git/hooks/pre-push

The hook reads the push's stdin refs; when in doubt run it manually before
pushing:

    bash scripts/prepush-privacy-gate.sh HEAD origin

## Honest limits (what can bypass it)

- `git push --no-verify` skips the local hook. CI on push still catches it,
  but only branch protection with this check REQUIRED makes it blocking for
  merges; until that repo setting is enabled, CI is advisory (red X, not a wall).
- The generic patterns catch emails/secrets. New kinds of personal data a
  pattern does not describe are not caught - extend the private marker list
  (kept outside the repo) when incidents happen.
- History already public before this gate existed is out of its scope.

## Rule for Cursor/agent edits

Never commit real member names, emails, phone numbers, addresses, invoice
payloads, or Zelle/payment identifiers - not in code, comments, fixtures,
docs, or filenames. Use `person@example.com`-style placeholders. Real
payloads (e.g. family invoice JSON) live in Vercel environment variables.

## CI activation (one manual step)

OAuth tokens without the `workflow` scope cannot push GitHub Actions files,
so the workflow ships as `docs/privacy-gate.workflow.yml`. To activate: copy
it to `.github/workflows/privacy-gate.yml` via the GitHub web UI (or push
with a workflow-scoped token), then enable branch protection requiring the
`privacy-gate` check. Until both happen, CI is not gating anything.

## Vercel build gate (active on this branch)

`vercel.json` prepends the tree scan to `buildCommand`; a dirty tree FAILS
the build loudly (red deployment), a clean tree builds normally. This blocks
previews/deploys from dirty content on any branch that carries the file.
(Vercel's ignoreCommand was rejected for this use: its exit-code semantics
are inverted - exit 0 skips the build.)
