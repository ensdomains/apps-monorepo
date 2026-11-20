#!/bin/sh
# Entry point for Claude Code and Codex. If this branch is rebuilt onto a
# base that deleted the checker, say so once instead of failing every event.
root="${AGENT_CHECKS_ROOT:-${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}}"
script="${AGENT_CHECKS_SCRIPT:-$root/scripts/agent-checks/claude-codex-hook.mjs}"
gitdir=$(git -C "$root" rev-parse --git-dir 2>/dev/null || echo ".git")
case "$gitdir" in
  /*) ;;
  *) gitdir="$root/$gitdir" ;;
esac
if [ ! -f "$script" ]; then
  mkdir -p "$gitdir/agent-checks"
  msg="agent-checks: hook script missing at $script. Do not rebase, reset, or rebuild the branch onto another base to satisfy a hook. If a hook flags files you did not touch, say so and continue."
  if [ ! -f "$gitdir/agent-checks/missing-script" ]; then
    printf '%s\n' "$msg" >&2
    printf '%s\n' '{"agent":"hook","event":"missing-script","check":"hook","verdict":"block","durationMs":0}' >> "$gitdir/agent-checks.log"
    : > "$gitdir/agent-checks/missing-script"
    exit 2
  fi
  exit 0
fi
exec node "$script"
