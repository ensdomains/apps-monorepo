import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"

const sessionId = `pi-${process.pid}`
let missingAnnounced = false

function announceMissing(script: string) {
  if (missingAnnounced) return
  missingAnnounced = true
  process.stderr.write(
    `agent-checks: hook script missing at ${script}. Do not rebase, reset, or rebuild the branch onto another base to satisfy a hook. If a hook flags files you did not touch, say so and continue.\n`,
  )
}

type Verdict = {
  readonly decision?: string
  readonly reason?: string
  readonly context?: string
}

type ToolEvent = {
  readonly toolName: string
  readonly input?: { readonly command?: string }
  readonly content?: unknown
}

type SettleEvent = {
  readonly entries: readonly unknown[]
}

type Extension = {
  on(
    event: "tool_call",
    handler: (event: ToolEvent) => { block: true; reason: string } | undefined,
  ): void
  on(
    event: "tool_result",
    handler: (event: ToolEvent) => { content: unknown } | undefined,
  ): void
  on(
    event: "agent_before_settle",
    handler: (
      event: SettleEvent,
    ) => { continue: true; entries: readonly unknown[] } | undefined,
  ): void
}

function repoRoot(): string {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  })
  return (result.stdout ?? "").trim()
}

function verdict(eventName: string, args: readonly string[]): Verdict {
  const root = repoRoot()
  const script = root ? `${root}/scripts/agent-checks/run.mjs` : "scripts/agent-checks/run.mjs"
  if (!root || !existsSync(script)) {
    announceMissing(script)
    return { decision: "allow" }
  }
  const result = spawnSync(
    process.execPath,
    [
      script,
      ...args,
      "--agent",
      "pi",
      "--event",
      eventName,
      "--session",
      sessionId,
      "--cwd",
      process.cwd(),
    ],
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

function withNote(content: unknown, note: string): unknown {
  if (typeof content === "string") return `${content}\n\n${note}`
  if (Array.isArray(content)) return [...content, { type: "text", text: note }]
  return content
}

export default function agentChecks(pi: Extension) {
  verdict("session_start", ["session-start"])
  pi.on("tool_call", (event) => {
    if (event.toolName !== "bash") return undefined
    const checked = verdict("tool_call", [
      "guard-command",
      "--command",
      event.input?.command ?? "",
    ])
    if (checked.decision === "block" && checked.reason) {
      return { block: true, reason: checked.reason }
    }
    return undefined
  })

  pi.on("tool_result", (event) => {
    if (event.toolName !== "bash" && event.toolName !== "write" && event.toolName !== "edit") {
      return undefined
    }
    const checked = verdict("tool_result", ["check-diff"])
    const parts = [checked.context ?? "", checked.decision === "feedback" ? (checked.reason ?? "") : ""]
    const note = parts.filter((part) => part.length > 0).join("\n\n")
    if (!note) return undefined
    const content = withNote(event.content, note)
    if (content === event.content) return undefined
    return { content }
  })

  pi.on("agent_before_settle", (event) => {
    const checked = verdict("agent_before_settle", ["verify"])
    if (checked.decision !== "block" || !checked.reason) return undefined
    return {
      continue: true,
      entries: [
        ...event.entries,
        {
          type: "custom_message",
          customType: "agent-checks",
          content: checked.reason,
          display: false,
        },
      ],
    }
  })
}
