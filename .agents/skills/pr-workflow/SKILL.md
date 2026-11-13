---
name: pr-workflow
description: How to open a pull request in this monorepo, including Linear app scope, branch name, tests, and the PR body. Use when opening a PR, writing a PR body, working from a Linear ticket, or changing runtime behaviour.
---

## Which app

This repo has multiple apps under `apps/`. When the task comes from a Linear ticket, the project name contains the app folder (for example "manager app v4 beta" means `apps/manager/`).

Only modify files in that app unless the change genuinely needs shared code (`packages/`).

## Branch

When the work starts from a Linear ticket, name the branch `linear/<ticket-id>`. Never rebase, reset, or rebuild the branch onto a different base to satisfy a hook. If a hook flags files you did not touch, say so and continue.

## Tests

If the change touches runtime behaviour, load skill `writing-tests` before writing tests. Add or update focused tests next to the code and run `pnpm exec vitest run --maxWorkers=4 <paths>` before committing. Keep existing cases; do not replace them.

## Body

Summarize the changes. Do not paste the raw ticket.

Callers, existing tests, and behaviour all go inside `## Regression check`. Do not add `## Behaviour changes` or `## Behaviour changes for users`.

```markdown
## Regression check

Callers checked: `mergedRowMetadata` in apps/manager. No other callers.
Tests: none changed. The 10-day case is unchanged; 45-day and 90-day cases were added.
Behaviour verified: names are flagged as expiring soon 60 days ahead, for every caller of this helper.
```

Those three labels are required, on their own lines, inside this section. A behaviour sentence that appears only in the summary does not count.

## A module that is outgrowing its structure

Signs are listed in STYLEGUIDE.md under Managing Growing Complexity (copied decisions, optional booleans encoding state, two sources of truth, another special case, hidden clock or client reads, thrown errors steering flow, retry handled off to the side).

When you see them in code this task touches:

- Do not restructure inside the fix or feature PR.
- Do not make it worse: put the new logic in a pure function, reuse the existing predicate, add a union variant instead of another flag.
- Add `## Design notes` naming the signs and the pattern that fits.
- For a large module, propose a plan as a ticket: target design, steps that each ship behind the existing tests, and what must not change. Do not do that rewrite in this PR.

## Before opening the PR

Read `git diff origin/main...HEAD` the way a reviewer will.

- In Claude Code, hand the diff to the `greptile-reviewer` subagent. It reads `.greptile/config.json` in a fresh context and returns findings.
- In other agents, do that review yourself: `.greptile/config.json` (high rules first), then `.greptile/rules.md`. Open a STYLEGUIDE section only when a rule points at it.

Also check:

- Decisions live in pure functions. No `Result` unwrapped by throwing (`Promise.reject(result.error)` at a promise boundary, or `yield*` inside `ResultFn`, is the boundary).
- viem first: `formatUnits` / `parseUnits`, viem's `*ErrorType` as the cause of a viem failure, `bigint` until the value is displayed.
- Added lines have no `any`, no `!`, no `as unknown as`, no `biome-ignore`, no `@ts-expect-error`. Each new comment is one line.
- `npx biome lint` on the changed files raises no complexity warning above what that function had on `main`.
- Run `main`'s copy of every test you edited against your code. Each failure is an intended behaviour change.
- This repo is public: no wording in commits, branches, or the PR that reads as a vulnerability.

## Creating or editing a Linear ticket

Follow the latest `ens-linear-tickets` skill from the ens-labs-wiki (onboarding clones it to `~/ens/ens-labs-wiki`):

1. `git -C <wiki> fetch origin main`. On a clean `main` checkout, `git -C <wiki> pull --ff-only`. Do not reset, stash, or switch branches.
2. If `skills/ens-linear-tickets/` differs from `origin/main`, read it with `git show`, not the local copy.
3. Load `skills/ens-linear-tickets/SKILL.md` and follow it.
4. If there is no wiki clone, the fetch fails, or the skill is missing, say so, use whatever copy exists (note its commit), and do not block the task.
