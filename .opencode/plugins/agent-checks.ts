import { spawnSync } from "node:child_process"
import { Plugin } from "@opencode/plugin"

type Verdict = {
  readonly decision?: string
  readonly reason?: string
  readonly context?: string
}

type ToolEvent = {
  readonly tool?: string
  readonly input?: { readonly command?: string }
  result?: unknown
}

function repoRoot(): string {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  })
  return (result.stdout ?? "").trim()
}

function verdict(eventName: string, args: readonly string[]): Verdict {
  const root = repoRoot()
  if (!root) return { decision: "allow" }
  const result = spawnSync(
    process.execPath,
    [`${root}/scripts/agent-checks/run.mjs`, ...args, "--agent", "opencode", "--event", eventName],
    { cwd: root, encoding: "utf8" },
  )
  const line = (result.stdout ?? "").split("\n").find((entry) => entry.startsWith("{"))
  if (!line) return { decision: "allow" }
  try {
    const parsed = JSON.parse(line) as Verdict
    if (parsed.decision === "feedback" || parsed.decision === "block") {
      process.stderr.write(`agent-checks: ${parsed.decision} ${args[0] ?? "check"}\n`)
    }
    return parsed
  } catch {
    return { decision: "allow" }
  }
}

export default Plugin.define({
  id: "ens.agent-checks",
  async setup(ctx) {
    await ctx.tool.hook("execute.before", (event: ToolEvent) => {
      const tool = event.tool ?? ""
      if (tool !== "bash" && tool !== "shell") return
      const checked = verdict("execute.before", [
        "guard-command",
        "--command",
        event.input?.command ?? "",
      ])
      if (checked.decision === "block" && checked.reason) {
        throw new Error(checked.reason)
      }
    })

    await ctx.tool.hook("execute.after", (event: ToolEvent) => {
      const tool = event.tool ?? ""
      if (tool !== "bash" && tool !== "shell" && tool !== "edit" && tool !== "write") return
      const checked = verdict("execute.after", ["check-diff"])
      const parts = [
        checked.context ?? "",
        checked.decision === "feedback" ? (checked.reason ?? "") : "",
      ]
      const note = parts.filter((part) => part.length > 0).join("\n\n")
      if (!note || typeof event.result !== "string") return
      event.result = `${event.result}\n\nAgent check (feedback only): ${note}`
    })
  },
})
