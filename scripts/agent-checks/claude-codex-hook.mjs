#!/usr/bin/env node
/**
 * Claude Code and Codex adapter. Both read hook JSON on stdin and accept
 * the same PreToolUse / PostToolUse / Stop decision fields.
 * Command bans deny the tool. Diff findings are additionalContext, not a deny.
 * Stop blocks once on a failed typecheck or test run, and on a PR body that
 * is present but missing its sections. stop_hook_active skips the second pass.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const runner = path.join(here, 'run.mjs')

const raw = readFileSync(0, 'utf8')
/** @type {Record<string, unknown>} */
let input = {}
try {
  input = raw.trim() ? JSON.parse(raw) : {}
} catch {
  input = {}
}

const event = stringField(input, 'hook_event_name')
const tool = stringField(input, 'tool_name')
const toolInput = objectField(input, 'tool_input')
const sessionId = stringField(input, 'session_id') || 'default'

if (!existsSync(runner)) {
  missingScript(runner)
  process.exit(process.exitCode ?? 0)
}

if (event === 'SessionStart') {
  call(agentName(input), 'SessionStart', ['session-start'])
  process.exit(0)
}

if (event === 'PreToolUse' && (tool === 'Bash' || tool === 'bash')) {
  const verdict = call(agentName(input), event, [
    'guard-command',
    '--command',
    stringField(toolInput, 'command'),
  ])
  if (verdict.decision === 'block') {
    note(verdict)
    write({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: verdict.reason,
      },
    })
  }
  process.exit(0)
}

if (event === 'PostToolUse') {
  const verdict = call(agentName(input), event, ['check-diff'])
  const parts = []
  if (verdict.context && markOnce(stringField(input, 'session_id'))) {
    parts.push(verdict.context)
  }
  if (verdict.decision === 'feedback' && verdict.reason) {
    if (feedbackChanged(stringField(input, 'session_id'), verdict.reason)) {
      parts.push(verdict.reason)
    }
  } else {
    clearFeedback(stringField(input, 'session_id'))
  }
  if (parts.length > 0) {
    note(verdict)
    write({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: parts.join('\n\n'),
      },
    })
  }
  process.exit(0)
}

if (event === 'Stop' && input.stop_hook_active !== true && !stringField(input, 'agent_id')) {
  const verified = call(agentName(input), event, ['verify'])
  if (verified.decision === 'block') {
    note(verified)
    write({ decision: 'block', reason: verified.reason })
    process.exit(0)
  }
  const body = call(agentName(input), event, ['pr-body'])
  if (body.decision === 'block') {
    note(body)
    write({ decision: 'block', reason: body.reason })
  }
}

process.exit(0)

/**
 * @param {string} agent
 * @param {string} event
 * @param {readonly string[]} args
 * @returns {{ decision?: string, reason?: string, context?: string }}
 */
function call(agent, eventName, args) {
  const result = spawnSync(
    process.execPath,
    [runner, ...args, '--agent', agent, '--event', eventName, '--session', sessionId, '--cwd', stringField(input, 'cwd') || process.cwd()],
    { encoding: 'utf8' },
  )
  const stdout = result.stdout ?? ''
  const line = stdout.trim().split('\n').find((entry) => entry.startsWith('{'))
  if (!line) return { decision: 'allow', reason: '' }
  try {
    return JSON.parse(line)
  } catch {
    return { decision: 'allow', reason: '' }
  }
}

/**
 * @param {{ decision?: string }} verdict
 */
function note(verdict) {
  if (verdict.decision === 'feedback' || verdict.decision === 'block') {
    process.stderr.write(`agent-checks: ${verdict.decision}\n`)
  }
}

/**
 * Codex sends turn_id. Claude does not.
 * @param {Record<string, unknown>} payload
 */
function agentName(payload) {
  if (typeof payload.turn_id === 'string' && payload.turn_id.length > 0) return 'codex'
  return 'claude'
}

/**
 * @param {string} script
 */
function missingScript(script) {
  const message =
    `agent-checks: hook script missing at ${script}. Do not rebase, reset, or rebuild the branch onto another base to satisfy a hook. If a hook flags files you did not touch, say so and continue.`
  let gitDir = ''
  try {
    gitDir = execFileSync('git', ['rev-parse', '--git-dir'], { encoding: 'utf8' }).trim()
  } catch {
    gitDir = ''
  }
  const stamp = gitDir ? path.resolve(gitDir, 'agent-checks', 'missing-script') : ''
  if (stamp && existsSync(stamp)) {
    process.exitCode = 0
    return
  }
  process.stderr.write(`${message}\n`)
  if (gitDir) {
    mkdirSync(path.dirname(stamp), { recursive: true })
    writeFileSync(stamp, '1')
    appendFileSync(
      path.resolve(gitDir, 'agent-checks.log'),
      `${JSON.stringify({ agent: 'hook', event: 'missing-script', check: 'hook', verdict: 'block', durationMs: 0 })}\n`,
    )
  }
  process.exitCode = 2
}

/**
 * @param {unknown} value
 */
function write(value) {
  process.stdout.write(JSON.stringify(value))
}

/**
 * @param {Record<string, unknown>} source
 * @param {string} key
 */
function stringField(source, key) {
  const value = source[key]
  return typeof value === 'string' ? value : ''
}

/**
 * @param {Record<string, unknown>} source
 * @param {string} key
 * @returns {Record<string, unknown>}
 */
function objectField(source, key) {
  const value = source[key]
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return /** @type {Record<string, unknown>} */ (value)
  }
  return {}
}

/**
 * @param {string} sessionId
 * @returns {boolean} true the first time this session asks
 */
function markOnce(sessionId) {
  if (!sessionId) return true
  const file = stateFile(sessionId, 'tm')
  if (existsSync(file)) return false
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, '1')
  return true
}

/** Show identical feedback once per unchanged feedback state. */
function feedbackChanged(sessionId, reason) {
  if (!sessionId) return true
  const file = stateFile(sessionId, 'feedback')
  const hash = createHash('sha256').update(reason).digest('hex')
  if (existsSync(file) && readFileSync(file, 'utf8') === hash) return false
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, hash)
  return true
}

function clearFeedback(sessionId) {
  if (!sessionId) return
  rmSync(stateFile(sessionId, 'feedback'), { force: true })
}

function stateFile(sessionId, suffix) {
  const safe = sessionId.replace(/[^A-Za-z0-9._-]/g, '_')
  return path.join(os.tmpdir(), 'ens-agent-checks', `${safe}-${suffix}`)
}
