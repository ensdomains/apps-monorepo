# Agent checks

`run.mjs` is the check. Claude Code, Codex, pi, and OpenCode only translate its JSON verdict. A one-line record is appended to `.git/agent-checks.log` (timestamp, agent, event, check, verdict, durationMs). That file is gitignored with the rest of `.git`. When a check finds something, the process also prints `agent-checks: feedback <check>` or `agent-checks: block <check>` on stderr.

The session base is the commit recorded at SessionStart (or the first non-Stop hook) in `.git/agent-checks/sessions/`. Review uses that commit, then `AGENT_CHECKS_BASE`, then the branch upstream merge-base, and `origin/main` only after those. Commits already on the branch when the session started are not the agent's changes. `--base` still forces a base for CI.

Diff findings, including a runtime source file under `apps/` or `packages/` with no related `*.test.*` or `*.spec.*` file in the same diff, are feedback. Lefthook runs that on pre-commit and pre-push and does not fail the git command. Stop may block once for a missing related test or a failed typecheck. A second Stop on the same HEAD and diff returns feedback `already reported` instead of blocking again. A tree change can block again. No changed files means Stop skips verification.

If `hook.sh` or the checker it runs is gone, the hook prints one message and logs it. Do not rebase or rebuild the branch to bring the script back.

## Codex: trust the hooks before the first prompt

Project hooks in `.codex/hooks.json` do not run until two gates are open. Doing this after you paste a ticket lets the trust screen consume that prompt.

1. Trust the repo folder. In `~/.codex/config.toml`, the project (or its git root) needs `trust_level = "trusted"` under `[projects."/absolute/path/to/apps-monorepo"]`.
2. Start an interactive `codex` session in this repo before you send the task. At "Hooks need review", choose **Trust all and continue**. If you already passed the dialog, run `/hooks`, trust the hooks, then send the task as the next message.
3. Trust is stored against the hook definition's hash. Editing `.codex/hooks.json` marks the hooks for review again, and they stay skipped until you trust them again.

`codex exec` has no prompt, so finish the interactive trust step once first. `--dangerously-bypass-hook-trust` skips the persisted hook-trust check for that invocation only; it does not replace folder trust.
