---
name: pr-workflow
description: How to open a pull request in this monorepo, including Linear app scope, tests, review, and the PR body. Use when opening a PR, writing a PR body, working from a Linear ticket, or changing runtime behaviour.
---

## Which app

Map product names before searching for code:

- Manager → `apps/manager/`
- Explorer or Portal → `apps/portal/`
- API Worker → `workers/api-worker/`
- ens.domains Website or Public Website → outside this repo, `ensdomains/ens.domains`

Treat the ticket's Project and labels as scope signals before searching. Only modify files in that area unless the change genuinely needs shared code (`packages/`). If a cited file or service is absent after one repo search, do not guess a similarly named feature. Report that the ticket belongs to another repository and name it only when you can verify the owner.

If the ticket is marked Needs Design, has no desired outcome, or says a prerequisite already exists but it is absent from the session base, verify that once and stop for a decision. Do not invent the missing design or prerequisite. If the ticket asks for a stacked base that differs from the supplied session base, report the conflict instead of rebasing without approval.

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

## Before committing

Run the reviewer in a fresh context before you commit. It is advisory. Mention its questions in the PR body or your final message, and do not change code because of a question. If a finding conflicts with the ticket text, the ticket wins.

- Claude Code: Agent tool, `subagent_type` `greptile-reviewer` (`.claude/agents/greptile-reviewer.md`).
- pi: `subagent({ agent: "greptile-reviewer", task: "..." })` from the pi-subagents extension (`.pi/agents/greptile-reviewer.md`).
- Codex: spawn the project agent named `greptile-reviewer` (`.codex/agents/greptile-reviewer.toml`) in a fresh thread. If the spawn tool has no agent-name field, pass that file's `developer_instructions` as the child prompt.
- If you cannot spawn a subagent, run the checklist in `.agents/agents/greptile-reviewer.md` yourself.

The canonical text is `.agents/agents/greptile-reviewer.md`. Give the reviewer the ticket title, full description, Project and labels when available. Acceptance criteria are examples, not the boundary of the change.

Also check:

- Decisions live in pure functions. No `Result` unwrapped by throwing (`Promise.reject(result.error)` at a promise boundary, or `yield*` inside `ResultFn`, is the boundary).
- viem first: `formatUnits` / `parseUnits`, viem's `*ErrorType` as the cause of a viem failure, `bigint` until the value is displayed.
- Added lines have no `any`, no `!`, no `as unknown as`, no `biome-ignore`, no `@ts-expect-error`. Existing test casts and suppressions are not precedent; use a typed builder, `satisfies`, or the real fixture shape. Each new comment is one line.
- Run `pnpm exec biome check <changed files>` before committing. Fix formatting first.
- Run `pnpm exec biome lint <changed files>`. Only if it reports complexity in a pre-existing function, compare that function with the session base (the starting commit/merge-base selected when the session began); never hard-code `main`, and do not extract a base copy when there is no warning. Compare in a temporary worktree: `tmp=$(mktemp -d); git worktree add --detach "$tmp" <session-base>; pnpm exec biome lint --config-path="$tmp/biome.jsonc" "$tmp/<path>"; git worktree remove "$tmp"`.
- Run the session base's copy (the starting commit/merge-base selected when the session began) of every test you edited against your code. Each failure is an intended behaviour change; never hard-code `main`.
- This repo is public: no wording in commits, branches, or the PR that reads as a vulnerability.

## Creating or editing a Linear ticket

Follow the latest `ens-linear-tickets` skill from the ens-labs-wiki (onboarding clones it to `~/ens/ens-labs-wiki`):

1. `git -C <wiki> fetch origin main`. On a clean `main` checkout, `git -C <wiki> pull --ff-only`. Do not reset, stash, or switch branches.
2. If `skills/ens-linear-tickets/` differs from `origin/main`, read it with `git show`, not the local copy.
3. Load `skills/ens-linear-tickets/SKILL.md` and follow it.
4. If there is no wiki clone, the fetch fails, or the skill is missing, say so, use whatever copy exists (note its commit), and do not block the task.
