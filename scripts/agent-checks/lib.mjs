/**
 * Pure checks behind the agent hooks. Scripts print
 * { decision: "allow" | "block" | "feedback", reason, context? }.
 * Command bans and stop-time verification may block. Diff findings are
 * feedback: STYLEGUIDE allows a justified exception.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const TSC_REASON =
  'Do not run `npx tsc`, `pnpx tsc`, `pnpm exec tsc`, or `node_modules/.bin/tsc`. Run `pnpm typecheck` from the app or package directory.'

const TEST_REASON =
  'Do not run the full suite (`pnpm test`, `pnpm test:all`, `pnpm -r test`, or `vitest run` with no paths). Run `pnpm exec vitest run --maxWorkers=4 <paths>` for the files this change affects.'

const TM_CONTEXT =
  'Read packages/transaction-manager/AGENTS.md before editing that package. Codex and pi do not auto-load nested instruction files when the session started at the repo root.'

const ANY_PATTERN =
  /(?::\s*any\b|\bas\s+any\b|<\s*any\s*>|,\s*any\s*[,>]|\bany\[\])/
const NON_NULL_PATTERN = /(?<=[\w)\]])!(?!!|=)/
const SUPPRESSION_PATTERN =
  /\bbiome-ignore\b|@ts-expect-error|@ts-ignore|\bas\s+unknown\s+as\b|eslint-disable/
const UNWRAP_PATTERN = /isErr\(\)\)\s*throw|throw\s+\w+\.error|_unsafeUnwrap/
const SKIP_PATTERN = /\b(?:it|test|describe)\.(?:skip|only|todo)\(|\bxit\(|\bxdescribe\(/

/**
 * @param {string} command
 * @returns {{ decision: 'allow' | 'block', reason: string }}
 */
export function guardCommand(command) {
  const text = command ?? ''
  if (
    /(npx|pnpx)\s+tsc\b/.test(text) ||
    /pnpm\s+exec\s+tsc\b/.test(text) ||
    /pnpm\s+dlx\s+tsc\b/.test(text) ||
    /node_modules\/\.bin\/tsc\b/.test(text)
  ) {
    return { decision: 'block', reason: TSC_REASON }
  }

  for (const segment of splitSegments(text)) {
    const tokens = commandTokens(segment)
    if (tokens.length === 0) continue
    if (isBannedTsc(tokens)) return { decision: 'block', reason: TSC_REASON }
    if (isBannedTest(tokens)) return { decision: 'block', reason: TEST_REASON }
  }
  return { decision: 'allow', reason: '' }
}

/**
 * @param {string} command
 * @returns {readonly string[]}
 */
export function splitSegments(command) {
  const segments = []
  let current = ''
  let quote = ''
  for (let i = 0; i < command.length; i++) {
    const char = command[i] ?? ''
    if (quote) {
      current += char
      if (char === quote && command[i - 1] !== '\\') quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }
    if (char === '\n' || char === ';') {
      segments.push(current)
      current = ''
      continue
    }
    const next = command[i + 1] ?? ''
    if ((char === '&' && next === '&') || (char === '|' && next === '|')) {
      segments.push(current)
      current = ''
      i += 1
      continue
    }
    current += char
  }
  if (current.trim()) segments.push(current)
  return segments.map((segment) => segment.trim()).filter((segment) => segment.length > 0)
}

/**
 * @param {readonly string[]} tokens
 */
function isBannedTsc(tokens) {
  const index = tokens.findIndex(
    (token) => token === 'tsc' || token.endsWith('/tsc'),
  )
  if (index === -1) return false
  const previous = tokens[index - 1]
  const before = tokens[index - 2]
  if (previous === 'npx' || previous === 'pnpx') return true
  if (previous === 'dlx' && before === 'pnpm') return true
  if (previous === 'exec' && before === 'pnpm') return true
  if (previous === 'node' && tokens[index]?.endsWith('/tsc')) return true
  return index === 0
}

/**
 * @param {readonly string[]} tokens
 */
function isBannedTest(tokens) {
  if (tokens[0] === 'pnpm') {
    const args = tokens.slice(1)
    const positional = args.filter((arg) => !arg.startsWith('-'))
    const script = positional[0]
    const recursive = args.includes('-r') || args.includes('--recursive')
    const filtered = args.some(
      (arg) => arg === '--filter' || arg.startsWith('--filter=') || arg === '-F',
    )
    if (script === 'test:all') return true
    if (recursive && positional.includes('test')) return true
    if (script === 'test' && !filtered) return true
  }

  const runAt = tokens.findIndex(
    (token, index) =>
      token === 'run' &&
      (tokens[index - 1] === 'vitest' || tokens[index - 1]?.endsWith('/vitest') === true),
  )
  if (runAt === -1) return false
  const paths = tokens.slice(runAt + 1).filter((token) => !token.startsWith('-'))
  return paths.length === 0
}

/**
 * @param {string} segment
 * @returns {readonly string[]}
 */
function commandTokens(segment) {
  const tokens = tokenize(segment)
  let index = 0
  while (tokens[index] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index] ?? '')) {
    index += 1
  }
  return tokens.slice(index)
}

/**
 * @param {string} segment
 * @returns {string[]}
 */
function tokenize(segment) {
  const tokens = []
  let current = ''
  let quote = ''
  for (let i = 0; i < segment.length; i++) {
    const char = segment[i] ?? ''
    if (quote) {
      if (char === quote) quote = ''
      else current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) tokens.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current) tokens.push(current)
  return tokens
}

/**
 * @typedef {{ path: string, line: number, rule: string, message: string }} Finding
 */

/**
 * @param {string} diff
 * @returns {{ decision: 'allow' | 'feedback', reason: string, context: string, findings: readonly Finding[] }}
 */
export function reviewDiff(diff) {
  const files = parseDiff(diff)
  const findings = []
  for (const file of files) {
    if (!isCheckedSource(file.path)) continue
    findings.push(...findingsForFile(file))
  }
  const capped = findings.slice(0, 40)
  const context = files.some((file) =>
    file.path.startsWith('packages/transaction-manager/'),
  )
    ? TM_CONTEXT
    : ''
  if (capped.length === 0) {
    return { decision: 'allow', reason: '', context, findings: capped }
  }
  const reason = [
    'Agent checks (feedback only; a justifying comment can keep an exception):',
    ...capped.map((finding) => `- ${finding.path}:${finding.line}: ${finding.message}`),
  ].join('\n')
  return { decision: 'feedback', reason, context, findings: capped }
}

/**
 * @param {string} path
 */
function isCheckedSource(path) {
  if (!/\.tsx?$/.test(path)) return false
  if (path.endsWith('.gen.ts') || path.endsWith('.gen.d.ts')) return false
  if (path.endsWith('worker-configuration.d.ts')) return false
  if (path.endsWith('routeTree.gen.ts')) return false
  return true
}

/**
 * @param {string} diff
 */
export function parseDiff(diff) {
  /** @type {{ path: string, added: { line: number, text: string }[], removed: string[] }[]} */
  const files = []
  /** @type {{ path: string, added: { line: number, text: string }[], removed: string[] } | null} */
  let current = null
  let newLine = 0
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      const match = raw.match(/ b\/(.+)$/)
      current = { path: match?.[1] ?? '', added: [], removed: [] }
      files.push(current)
      newLine = 0
      continue
    }
    if (raw.startsWith('+++ b/')) {
      if (current) current.path = raw.slice('+++ b/'.length)
      continue
    }
    if (raw.startsWith('@@')) {
      const match = raw.match(/\+(\d+)/)
      newLine = match ? Number(match[1]) : 0
      continue
    }
    if (!current) continue
    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      current.added.push({ line: newLine, text: raw.slice(1) })
      newLine += 1
      continue
    }
    if (raw.startsWith('-') && !raw.startsWith('---')) {
      current.removed.push(raw.slice(1))
      continue
    }
    if (raw.startsWith('\\')) continue
    newLine += 1
  }
  return files
}

/**
 * @param {{ path: string, added: { line: number, text: string }[], removed: string[] }} file
 * @returns {Finding[]}
 */
function findingsForFile(file) {
  /** @type {Finding[]} */
  const findings = []
  const addedText = file.added.map((line) => line.text).join('\n')
  const isTest = /\.test\.tsx?$/.test(file.path) || file.path.includes('/__tests__/')
  const isTsx = file.path.endsWith('.tsx')

  for (const line of file.added) {
    const code = stripLineComment(line.text)
    if (ANY_PATTERN.test(code)) {
      findings.push(finding(file.path, line.line, 'R13', '`any` (use `unknown`)'))
    }
    if (NON_NULL_PATTERN.test(code)) {
      findings.push(finding(file.path, line.line, 'R14', 'non-null assertion `!`'))
    }
    if (SUPPRESSION_PATTERN.test(code)) {
      findings.push(
        finding(file.path, line.line, 'R39', 'new suppression (`biome-ignore`, `@ts-expect-error`, `as unknown as`, or eslint-disable)'),
      )
    }
    if (UNWRAP_PATTERN.test(code)) {
      findings.push(finding(file.path, line.line, 'R18', 'Result unwrapped by throwing'))
    }
    if (isTest && SKIP_PATTERN.test(code)) {
      findings.push(finding(file.path, line.line, 'R38', 'skipped, exclusive, or todo test'))
    }
    if (isTsx && /create(?:Public|Wallet)?Client\s*\(/.test(code)) {
      findings.push(finding(file.path, line.line, 'R21', 'viem client created in a component file'))
    }
  }

  if (/\btry\s*\{/.test(addedText) && /\b(ResultAsync|Result|errAsync|okAsync)\b|\berr\(|\bok\(/.test(addedText)) {
    findings.push(finding(file.path, firstAddedLine(file), 'R17', 'try/catch in a diff that also builds a Result'))
  }
  if (/Promise\.resolve\(\)\s*\.then/.test(addedText)) {
    findings.push(
      finding(file.path, firstAddedLine(file), 'T08', '`Promise.resolve().then` around sync work; use `fromSync`'),
    )
  }
  if (isTsx && /\buseEffect\s*\(/.test(addedText)) {
    if (/fetch\(|readContract|queryClient\.fetchQuery/.test(addedText)) {
      findings.push(finding(file.path, firstAddedLine(file), 'R19', '`useEffect` that looks like data fetching'))
    }
    if (/startTransaction|writeContract|sendTransaction|\.mutate\(/.test(addedText)) {
      findings.push(finding(file.path, firstAddedLine(file), 'R20', '`useEffect` that looks like it chains a transaction'))
    }
  }
  if (isTest && loosenedMatcher(file.removed, file.added.map((line) => line.text))) {
    findings.push(finding(file.path, firstAddedLine(file), 'R38', 'matcher loosened (`toEqual`/`toBe` toward `toMatchObject`, `expect.any`, or `toBeTruthy`)'))
  }
  return findings
}

/**
 * @param {string} path
 * @param {number} line
 * @param {string} rule
 * @param {string} message
 * @returns {Finding}
 */
function finding(path, line, rule, message) {
  return { path, line, rule, message: `${message} (${rule})` }
}

/**
 * @param {{ added: { line: number }[] }} file
 */
function firstAddedLine(file) {
  return file.added[0]?.line ?? 1
}

/**
 * @param {string} line
 */
function stripLineComment(line) {
  let out = ''
  for (let i = 0; i < line.length; i++) {
    const char = line[i] ?? ''
    const next = line[i + 1] ?? ''
    const previous = line[i - 1] ?? ''
    if (char === '/' && next === '/' && previous !== ':') break
    out += char
  }
  return out
}

/**
 * @param {readonly string[]} removed
 * @param {readonly string[]} added
 */
function loosenedMatcher(removed, added) {
  const hadStrict = removed.some(
    (line) => /expect\(/.test(line) && /\.(?:toEqual|toStrictEqual|toBe)\(/.test(line),
  )
  const hasLoose = added.some(
    (line) =>
      /expect\(/.test(line) &&
      /\.(?:toMatchObject|toBeTruthy)\(|expect\.(?:any|anything)\(/.test(line),
  )
  return hadStrict && hasLoose
}

/**
 * @param {string} diff
 * @returns {readonly string[]}
 */
export function pathsInDiff(diff) {
  return parseDiff(diff).map((file) => file.path)
}

const REGRESSION_LABELS = ['Callers checked:', 'Tests:', 'Behaviour verified:']

const REGRESSION_SECTION_REASON =
  'Inside "## Regression check", include the lines "Callers checked:", "Tests:", and "Behaviour verified:". Do not put behaviour only in the summary or under a separate heading.'

/**
 * Text under the Regression check heading, up to the next heading.
 * @param {string} body
 * @returns {string | null}
 */
export function regressionCheckSection(body) {
  const match = body.match(/^#{1,3}[ \t]+regression check\s*$/im)
  if (!match || match.index === undefined) return null
  const after = body.slice(match.index + match[0].length)
  const next = after.search(/\n#{1,3}[ \t]+/)
  return (next === -1 ? after : after.slice(0, next)).trim()
}

export function reviewPrBody(body, diff) {
  if (body === undefined || body.trim() === '') {
    return { decision: 'allow', reason: '' }
  }
  const section = regressionCheckSection(body)
  if (section === null) {
    return {
      decision: 'block',
      reason: `PR body is missing a "## Regression check" section. ${REGRESSION_SECTION_REASON}`,
    }
  }
  const missing = REGRESSION_LABELS.filter(
    (label) => !new RegExp(`^${label.replace(/[.]/g, '\\$&')}`, 'im').test(section),
  )
  if (missing.length > 0) {
    return { decision: 'block', reason: REGRESSION_SECTION_REASON }
  }
  return { decision: 'allow', reason: '' }
}

/**
 * @param {{ branch: string, ticketId?: string, commitMessages?: readonly string[] }} input
 * @param {{ strict?: boolean }} options
 * @returns {{ decision: 'allow' | 'block' | 'feedback', reason: string }}
 */
export function reviewBranch(input, options = {}) {
  const ids = new Set()
  if (input.ticketId) ids.add(input.ticketId)
  for (const message of input.commitMessages ?? []) {
    for (const match of message.matchAll(/\b([A-Z][A-Z0-9]+-\d+)\b/g)) {
      const id = match[1]
      if (id) ids.add(id)
    }
  }
  if (ids.size === 0) return { decision: 'allow', reason: '' }
  const branch = input.branch.toLowerCase()
  const expected = [...ids].map((id) => `linear/${id.toLowerCase()}`)
  if (expected.includes(branch)) return { decision: 'allow', reason: '' }
  const reason = `Branch \`${input.branch}\` does not match ${expected.map((name) => `\`${name}\``).join(' or ')}.`
  return { decision: options.strict ? 'block' : 'feedback', reason }
}

/**
 * @param {readonly string[]} files
 * @returns {readonly string[]}
 */
export function packagesFor(files) {
  const packages = new Set()
  for (const file of files) {
    const [top, name] = file.split('/')
    if ((top === 'apps' || top === 'packages' || top === 'workers') && name) {
      packages.add(`${top}/${name}`)
    }
  }
  return [...packages]
}

/**
 * @param {string} pkg
 * @param {readonly string[]} files
 * @param {(path: string) => boolean} exists
 * @returns {readonly string[]}
 */
export function vitestTargets(pkg, files, exists) {
  const prefix = `${pkg}/`
  const targets = new Set()
  for (const file of files) {
    if (!file.startsWith(prefix)) continue
    const relative = file.slice(prefix.length)
    if (/\.test\.tsx?$/.test(relative)) {
      targets.add(relative)
      continue
    }
    if (!/\.tsx?$/.test(relative)) continue
    const stem = relative.replace(/\.tsx?$/, '')
    for (const suffix of ['.test.ts', '.test.tsx']) {
      const candidate = `${stem}${suffix}`
      if (exists(`${pkg}/${candidate}`)) targets.add(candidate)
    }
  }
  return [...targets]
}

/**
 * @param {string} path
 * @param {string} contents
 */
export function syntheticAddedDiff(filePath, contents) {
  const body = contents
    .split('\n')
    .map((line) => `+${line}`)
    .join('\n')
  return `diff --git a/${filePath} b/${filePath}\n--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${contents.split('\n').length} @@\n${body}\n`
}

const RUNTIME_EXT = /\.(?:[cm]?[jt]sx?)$/
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/

/**
 * @param {string} file
 */
export function isRuntimeSource(file) {
  if (!file.startsWith('apps/') && !file.startsWith('packages/')) return false
  if (!RUNTIME_EXT.test(file)) return false
  if (TEST_FILE.test(file)) return false
  if (file.includes('/__tests__/')) return false
  if (file.endsWith('.d.ts') || file.endsWith('.gen.ts') || file.endsWith('.gen.d.ts')) return false
  if (/\.stories\.[cm]?[jt]sx?$/.test(file)) return false
  return true
}

/**
 * Candidate test paths that count as related to a source file.
 * @param {string} file
 * @returns {readonly string[]}
 */
export function relatedTestPaths(file) {
  const dir = path.posix.dirname(file)
  const base = path.posix.basename(file).replace(/\.[^.]+$/, '')
  const exts = ['ts', 'tsx', 'js', 'jsx']
  const paths = []
  for (const ext of exts) {
    paths.push(`${dir}/${base}.test.${ext}`)
    paths.push(`${dir}/${base}.spec.${ext}`)
    paths.push(`${dir}/__tests__/${base}.test.${ext}`)
    paths.push(`${dir}/__tests__/${base}.spec.${ext}`)
  }
  return paths
}

/**
 * Runtime sources under apps/ or packages/ whose related test file is not in the diff.
 * @param {readonly string[]} files
 * @returns {readonly string[]}
 */
export function missingRelatedTests(files) {
  const changed = new Set(files)
  const missing = []
  for (const file of files) {
    if (!isRuntimeSource(file)) continue
    if (!relatedTestPaths(file).some((candidate) => changed.has(candidate))) {
      missing.push(file)
    }
  }
  return missing
}

/**
 * @param {readonly string[]} files
 */
export function missingTestsReason(files) {
  const listed = files.slice(0, 20).map((file) => `- ${file}`).join('\n')
  return [
    'Runtime source changed with no related *.test.* or *.spec.* file in the diff.',
    'Add or update the focused test next to the code, read skill writing-tests first, and run it before committing.',
    'Keep existing cases; do not replace them.',
    listed,
  ].join('\n')
}

/**
 * Diff-time verdict stays feedback. Stop uses missingRelatedTests and may block.
 * @param {{ decision: string, reason: string, context?: string, findings?: readonly { path: string, line: number, rule: string, message: string }[] }} review
 * @param {readonly string[]} files
 */
export function applyMissingTests(review, files) {
  const missing = missingRelatedTests(files)
  if (missing.length === 0) return review
  const extra = missingTestsReason(missing)
  return {
    ...review,
    decision: 'feedback',
    reason: [review.reason, extra].filter((part) => part.length > 0).join('\n\n'),
    findings: [
      ...(review.findings ?? []),
      { path: missing[0] ?? '', line: 1, rule: 'tests', message: extra },
    ],
  }
}

/**
 * @param {readonly string[]} parts
 */
export function verificationKey(parts) {
  return createHash('sha256').update(parts.join('\0')).digest('hex')
}

/**
 * @param {string} dir
 * @param {string} key
 * @returns {{ decision: string, reason: string } | null}
 */
export function readCachedVerdict(dir, key) {
  const file = path.join(dir, `${key}.json`)
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (parsed && (parsed.decision === 'allow' || parsed.decision === 'block' || parsed.decision === 'feedback')) {
      return { decision: parsed.decision, reason: typeof parsed.reason === 'string' ? parsed.reason : '' }
    }
  } catch {
    return null
  }
  return null
}

/**
 * @param {string} dir
 * @param {string} key
 * @param {{ decision: string, reason: string }} verdict
 */
export function writeCachedVerdict(dir, key, verdict) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `${key}.json`), JSON.stringify({ decision: verdict.decision, reason: verdict.reason }))
}

/**
 * One JSON line for .git/agent-checks.log.
 * @param {{ timestamp: string, agent: string, event: string, check: string, verdict: string, durationMs: number }} record
 */
export function formatLogRecord(record) {
  return JSON.stringify({
    timestamp: record.timestamp,
    agent: record.agent,
    event: record.event,
    check: record.check,
    verdict: record.verdict,
    durationMs: record.durationMs,
  })
}

/**
 * Session start wins. Then an explicit env base, the branch upstream
 * merge-base, and origin/main last. An explicit --base (CI) still wins.
 * @param {{ explicit?: string, sessionStart?: string, envBase?: string, upstreamMergeBase?: string, originMain?: string }} input
 */
export function selectBase(input) {
  const candidates = [
    input.explicit,
    input.sessionStart,
    input.envBase,
    input.upstreamMergeBase,
    input.originMain,
  ]
  for (const candidate of candidates) {
    if (candidate && candidate.trim()) return candidate.trim()
  }
  return ''
}

/**
 * A second Stop on the same tree must not block again.
 * @param {{ decision?: string, reason?: string } | null} cached
 * @returns {{ decision: string, reason: string } | null}
 */
export function repeatedStopVerdict(cached) {
  if (!cached) return null
  if (cached.decision === 'block') return { decision: 'feedback', reason: 'already reported' }
  return { decision: cached.decision ?? 'allow', reason: cached.reason ?? '' }
}

/**
 * @param {string} dir
 * @param {string} sessionId
 */
export function sessionBasePath(dir, sessionId) {
  const safe = sessionId.replace(/[^A-Za-z0-9._-]/g, '_')
  return path.join(dir, 'sessions', safe)
}

/**
 * @param {string} dir
 * @param {string} sessionId
 */
export function readSessionStart(dir, sessionId) {
  try {
    return readFileSync(sessionBasePath(dir, sessionId), 'utf8').trim()
  } catch {
    return ''
  }
}

/**
 * @param {string} dir
 * @param {string} sessionId
 * @param {string} sha
 */
export function writeSessionStart(dir, sessionId, sha) {
  const file = sessionBasePath(dir, sessionId)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${sha}\n`)
}
