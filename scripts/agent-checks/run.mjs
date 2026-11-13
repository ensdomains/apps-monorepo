#!/usr/bin/env node
/**
 * CLI for the portable agent checks.
 *
 *   node scripts/agent-checks/run.mjs guard-command --command "npx tsc"
 *   node scripts/agent-checks/run.mjs check-diff [--base origin/main]
 *   node scripts/agent-checks/run.mjs pr-body [--body-file path]
 *   node scripts/agent-checks/run.mjs branch-name [--strict]
 *   node scripts/agent-checks/run.mjs verify
 *   node scripts/agent-checks/run.mjs dead-exports
 *
 * Prints one JSON verdict on stdout. Exit 0 for allow and feedback.
 * Exit 2 for block, unless --report-only (always exit 0).
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import {
  agentOwnedFiles,
  applyMissingTests,
  formatLogRecord,
  guardCommand,
  missingRelatedTests,
  missingTestVerdict,
  packagesFor,
  pathsInDiff,
  readCachedVerdict,
  readSessionStart,
  repeatedStopVerdict,
  reviewBranch,
  reviewDiff,
  reviewPrBody,
  selectBase,
  syntheticAddedDiff,
  verificationKey,
  vitestTargets,
  writeCachedVerdict,
  writeSessionStart,
} from './lib.mjs'

function repoRoot() {
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return top || process.cwd()
  } catch {
    return process.cwd()
  }
}

const REPO_ROOT = repoRoot()

const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    command: { type: 'string', default: '' },
    base: { type: 'string' },
    'body-file': { type: 'string' },
    body: { type: 'string' },
    'report-only': { type: 'boolean', default: false },
    strict: { type: 'boolean', default: false },
    agent: { type: 'string', default: 'cli' },
    event: { type: 'string', default: 'cli' },
    session: { type: 'string', default: '' },
    cwd: { type: 'string', default: '' },
  },
})

const command = positionals[0] ?? ''
const started = Date.now()
const verdict = run(command, values)
const durationMs = Date.now() - started
const reportOnly = values['report-only']
recordLog({
  timestamp: new Date().toISOString(),
  agent: String(values.agent ?? 'cli'),
  event: String(values.event ?? 'cli'),
  check: command,
  verdict: verdict.decision ?? 'allow',
  durationMs,
})
if (verdict.decision === 'feedback' || verdict.decision === 'block') {
  process.stderr.write(`agent-checks: ${verdict.decision} ${command} (${durationMs}ms)\n`)
}
process.stdout.write(`${JSON.stringify(verdict)}\n`)
if (verdict.reason) process.stderr.write(`${verdict.reason}\n`)
if (reportOnly && process.env.GITHUB_ACTIONS === 'true') {
  for (const finding of verdict.findings ?? []) {
    process.stdout.write(
      `::warning file=${finding.path},line=${finding.line}::${finding.message}\n`,
    )
  }
  if (verdict.decision === 'block' && verdict.reason) {
    process.stdout.write(`::warning::${verdict.reason.replaceAll('\n', ' ')}\n`)
  }
}
process.exit(verdict.decision === 'block' && !reportOnly ? 2 : 0)

/**
 * @param {string} name
 * @param {Record<string, string | boolean | undefined>} options
 */
function run(name, options) {
  if (name === 'guard-command') {
    return guardCommand(String(options.command ?? ''), { cwd: String(options.cwd ?? '') })
  }
  if (name === 'session-start') return sessionStart(options)
  if (name === 'check-diff') return checkDiff(options)
  if (name === 'pr-body') return prBody(options)
  if (name === 'branch-name') return branchName(Boolean(options.strict))
  if (name === 'verify') return verify(options)
  if (name === 'dead-exports') return deadExports()
  return { decision: 'block', reason: `Unknown agent check \`${name}\`.` }
}

/**
 * @param {Record<string, string | boolean | undefined>} options
 */
function sessionStart(options) {
  noteSession(options, true)
  return { decision: 'allow', reason: '' }
}

/**
 * @param {Record<string, string | boolean | undefined>} options
 */
function checkDiff(options) {
  noteSession(options, false)
  const choice = resolveBase(options)
  let diff = ''
  if (choice.base) {
    diff += git(['diff', ...choice.range])
    diff += git(['diff', 'HEAD'])
  } else {
    diff += git(['diff', 'HEAD'])
  }
  for (const file of untrackedSource()) {
    if (!existsSync(inRepo(file))) continue
    const stat = readFileSync(inRepo(file))
    if (stat.length > 200_000) continue
    diff += syntheticAddedDiff(file, stat.toString('utf8'))
  }
  const reviewed = reviewDiff(diff)
  const missingPaths = choice.agentOwned
    ? filesForMissingTests(choice)
    : pathsInDiff(diff).concat(untrackedSource())
  return applyMissingTests(reviewed, missingPaths)
}

function prBody(options) {
  let body = options.body
  if (typeof body !== 'string' && typeof options['body-file'] === 'string') {
    body = readFileSync(options['body-file'], 'utf8')
  }
  if (typeof body !== 'string' && process.env.PR_BODY) body = process.env.PR_BODY
  if (typeof body !== 'string' && existsSync(inRepo('PR_BODY.md'))) {
    body = readFileSync(inRepo('PR_BODY.md'), 'utf8')
  }
  noteSession(options, false)
  const choice = resolveBase(options)
  const diff = choice.base ? git(['diff', ...choice.range]) : ''
  return reviewPrBody(typeof body === 'string' ? body : undefined, diff)
}

/**
 * @param {boolean} strict
 */
function branchName(strict) {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim()
  const messages = git(['log', '--format=%s%n%b', '-n', '20']).split('\n')
  const ticketId = process.env.LINEAR_TICKET_ID || process.env.LINEAR_ISSUE_ID || ''
  return reviewBranch(
    { branch, ticketId, commitMessages: messages },
    { strict },
  )
}

function verify(options) {
  if (process.env.AGENT_CHECKS_SKIP_VERIFY === '1') {
    return { decision: 'allow', reason: '' }
  }
  noteSession(options, false)
  const choice = resolveBase(options)
  const files = allChangedFiles(choice)
  if (files.length === 0) return { decision: 'allow', reason: '' }

  const cacheDir = verificationCacheDir()
  const key = verificationKey([
    git(['rev-parse', 'HEAD']).trim(),
    choice.base ? git(['diff', ...choice.range]) : '',
    git(['diff', 'HEAD']),
    untrackedFingerprint(),
  ])
  if (cacheDir) {
    const repeated = repeatedStopVerdict(readCachedVerdict(cacheDir, key))
    if (repeated) return repeated
  }

  const missing = missingRelatedTests(choice.agentOwned ? filesForMissingTests(choice) : files)
  const sourceFiles = files.filter((file) => /\.tsx?$/.test(file))
  const checked = verifyTypecheck(choice.base, sourceFiles)
  const verdict = missingTestVerdict(checked, missing)
  if (cacheDir) writeCachedVerdict(cacheDir, key, verdict)
  return verdict
}

/**
 * @param {string} ref
 * @param {readonly string[]} sourceFiles
 */
function verifyTypecheck(ref, sourceFiles) {
  if (packagesFor(sourceFiles).length === 0) return { decision: 'allow', reason: '' }
  if (!commandExists('pnpm')) {
    return {
      decision: 'feedback',
      reason: 'pnpm is not on PATH, so the stop hook did not typecheck. Run `pnpm typecheck` from each package you changed.',
    }
  }

  const typecheck = ref
    ? ['pnpm', '--filter', `...[${ref}]`, '--filter', '!{.}', 'typecheck']
    : ['pnpm', '--filter', '!{.}', 'typecheck']
  const typecheckResult = runLogged(typecheck, REPO_ROOT)
  if (typecheckResult.timedOut) {
    return {
      decision: 'feedback',
      reason: 'Typecheck exceeded 150s and was not treated as a failure. Run `pnpm --filter "...[origin/main]" --filter "!{.}" typecheck` yourself.',
    }
  }
  if (typecheckResult.status !== 0) {
    return {
      decision: 'block',
      reason: `Typecheck failed.\n${tail(typecheckResult.output)}`,
    }
  }

  for (const pkg of packagesFor(sourceFiles)) {
    const targets = vitestTargets(pkg, sourceFiles, (file) => existsSync(inRepo(file)))
    if (targets.length === 0) continue
    const result = runLogged(
      ['pnpm', 'exec', 'vitest', 'run', '--maxWorkers=4', ...targets],
      inRepo(pkg),
    )
    if (result.timedOut) {
      return {
        decision: 'feedback',
        reason: `Vitest in ${pkg} exceeded 150s. Run \`pnpm exec vitest run --maxWorkers=4 ${targets.join(' ')}\` from that directory.`,
      }
    }
    if (result.status !== 0) {
      return {
        decision: 'block',
        reason: `Tests failed in ${pkg}.\n${tail(result.output)}`,
      }
    }
  }
  return { decision: 'allow', reason: '' }
}

function deadExports() {
  if (!existsSync(inRepo('node_modules/knip'))) {
    return {
      decision: 'feedback',
      reason:
        'knip is not installed here. .github/workflows/test.yml still has the knip step commented out ("not configured for all packages"), so this check does not fail CI.',
    }
  }
  const result = spawnSync('pnpm', ['knip', '--include', 'files,exports'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 150_000,
    maxBuffer: 10_000_000,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  return {
    decision: 'feedback',
    reason: output
      ? `knip (report only):\n${tail(output)}`
      : 'knip produced no output (report only).',
  }
}

function allChangedFiles(choice) {
  const names = new Set()
  if (choice.base) {
    for (const line of git(['diff', '--name-only', ...choice.range]).split('\n')) {
      if (line) names.add(line)
    }
  }
  for (const line of git(['diff', '--name-only', 'HEAD']).split('\n')) if (line) names.add(line)
  for (const line of untrackedSource()) names.add(line)
  return [...names]
}

/**
 * Commits the agent created after the session started, plus the working tree.
 * @param {{ base: string }} choice
 * @returns {readonly string[]}
 */
function filesForMissingTests(choice) {
  const reflog = git(['reflog', '--format=%H%x09%gs']).split('\n').filter(Boolean)
  const worktree = [
    ...git(['diff', '--name-only', 'HEAD']).split('\n').filter(Boolean),
    ...untrackedSource(),
  ]
  return agentOwnedFiles(
    reflog,
    choice.base,
    (sha) => git(['diff-tree', '--no-commit-id', '--name-only', '-r', sha]).split('\n').filter(Boolean),
    worktree,
  )
}

/**
 * Record HEAD the first time a session is seen, except on Stop.
 * @param {Record<string, string | boolean | undefined>} options
 * @param {boolean} force
 */
function noteSession(options, force) {
  const sessionId = String(options.session ?? '')
  if (!sessionId) return ''
  const dir = agentStateDir()
  if (!dir) return ''
  const existing = readSessionStart(dir, sessionId)
  if (existing) return existing
  const event = String(options.event ?? '')
  const stop = event === 'Stop' || event === 'agent_before_settle'
  if (stop && !force) return ''
  const head = git(['rev-parse', 'HEAD']).trim()
  if (!head) return ''
  writeSessionStart(dir, sessionId, head)
  return head
}

/**
 * @param {Record<string, string | boolean | undefined>} options
 * @returns {{ base: string, range: string[], agentOwned: boolean }}
 */
function resolveBase(options) {
  const explicit = typeof options.base === 'string' ? options.base : ''
  const sessionId = String(options.session ?? '')
  const dir = agentStateDir()
  const sessionStart = sessionId && dir ? readSessionStart(dir, sessionId) : ''
  const base = selectBase({
    explicit,
    sessionStart,
    envBase: process.env.AGENT_CHECKS_BASE ?? '',
    upstreamMergeBase: upstreamMergeBase(),
    originMain: originMain(),
  })
  const twoDot = Boolean(sessionStart) && base === sessionStart
  return {
    base,
    range: base ? (twoDot ? [base, 'HEAD'] : [`${base}...HEAD`]) : [],
    agentOwned: twoDot,
  }
}

function absGitDir() {
  const gitDir = git(['rev-parse', '--git-dir']).trim()
  if (!gitDir) return ''
  return path.isAbsolute(gitDir) ? gitDir : path.resolve(REPO_ROOT, gitDir)
}

function agentStateDir() {
  const gitDir = absGitDir()
  return gitDir ? path.join(gitDir, 'agent-checks') : ''
}

function upstreamMergeBase() {
  const upstream = git(['rev-parse', '--abbrev-ref', '@{upstream}']).trim()
  if (!upstream) return ''
  return git(['merge-base', 'HEAD', '@{upstream}']).trim()
}

function originMain() {
  return git(['rev-parse', '--verify', '--quiet', 'origin/main']).trim()
}

/**
 * @param {string | undefined} ref
 * @returns {string[]}
 */
function verificationCacheDir() {
  const gitDir = absGitDir()
  return gitDir ? path.join(gitDir, 'agent-checks-cache') : ''
}

/**
 * @param {{ timestamp: string, agent: string, event: string, check: string, verdict: string, durationMs: number }} record
 */
function recordLog(record) {
  if (process.env.AGENT_CHECKS_LOG === '0') return
  const line = formatLogRecord(record)
  let file = process.env.AGENT_CHECKS_LOG
  if (!file) {
    const gitDir = absGitDir()
    if (!gitDir) return
    file = path.join(gitDir, 'agent-checks.log')
  }
  try {
    appendFileSync(file, `${line}\n`)
  } catch {
    return
  }
}

function untrackedSource() {
  return git(['ls-files', '--others', '--exclude-standard'])
    .split('\n')
    .filter((file) => /\.tsx?$/.test(file))
}

function untrackedFingerprint() {
  return untrackedSource()
    .map((file) => {
      try {
        return `${file}:${createHash('sha256').update(readFileSync(inRepo(file))).digest('hex')}`
      } catch {
        return file
      }
    })
    .join('\n')
}

/**
 * @param {readonly string[]} args
 */
function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return ''
  }
}

/**
 * @param {string} file
 */
function inRepo(file) {
  return path.resolve(REPO_ROOT, file)
}

/**
 * @param {readonly string[]} argv
 * @param {string} cwd
 */
function runLogged(argv, cwd) {
  const [bin, ...args] = argv
  if (!bin) return { status: 1, output: 'empty command', timedOut: false }
  const result = spawnSync(bin, args, {
    cwd,
    encoding: 'utf8',
    timeout: 150_000,
    maxBuffer: 10_000_000,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  return {
    status: result.status ?? 1,
    output,
    timedOut: result.error?.code === 'ETIMEDOUT',
  }
}

/**
 * @param {string} output
 */
function tail(output) {
  const text = output.trim()
  return text.length > 4000 ? text.slice(-4000) : text
}

/**
 * @param {string} bin
 */
function commandExists(bin) {
  const result = spawnSync('sh', ['-c', `command -v ${bin}`], { encoding: 'utf8' })
  return result.status === 0
}
