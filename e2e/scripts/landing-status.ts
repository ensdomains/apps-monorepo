/**
 * Landing ledger — how much of `e2e-tests-coverage` is on main yet.
 *
 * `pnpm --filter @ens-apps/e2e landing`
 *
 * Every path the branch changes is assigned to a batch (or dropped) by the
 * rules in `landing/batches.ts`. Its status is measured, never written by hand:
 *
 *   landed      the blob on main is the blob on the branch
 *   pending     differs, and its batch has not merged
 *   drifted     differs, although its batch merged — the branch moved since
 *   partial     an `incremental` file whose batch merged; later batches
 *               land the rest
 *   dropped     a DROP rule matches; it will never land
 *   UNASSIGNED  no rule matches — fix `batches.ts`
 *
 * Paths are remembered in `landing/manifest.txt`, so a path keeps its row
 * after it lands and stops showing up in `git diff main...branch`.
 *
 * Flags:
 *   --main <ref>        default origin/main
 *   --branch <ref>      default origin/e2e-tests-coverage
 *   --check             exit 1 on UNASSIGNED paths or smoke titles missing
 *                       from their spec on the branch
 *   --discard-check     exit 1 unless every path is landed or dropped and
 *                       every smoke test is on main with `@smoke`
 *   --batch <id> --paths  print the batch's paths that have not landed, one
 *                       per line (feed to `git checkout <branch> --`)
 *   --worktrees         print a triage table of local worktrees
 *   --no-write          do not rewrite the manifest or the ledger
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type Batch,
  type BatchId,
  batches,
  rules,
  type SmokeEntry,
  smoke,
  type Target,
} from '../landing/batches.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const manifestPath = resolve(here, '../landing/manifest.txt')
const ledgerPath = resolve(here, '../docs/landing-ledger.md')

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const option = (name: string, fallback: string) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const MAIN = option('--main', 'origin/main')
const BRANCH = option('--branch', 'origin/e2e-tests-coverage')

const git = (...gitArgs: string[]) =>
  execFileSync('git', gitArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    // A path missing from one ref is an answer here, not an error to print.
    stdio: ['ignore', 'pipe', 'pipe'],
  })

const tryGit = (...gitArgs: string[]): string | undefined => {
  try {
    return git(...gitArgs)
  } catch {
    return undefined
  }
}

// ── Rules ──────────────────────────────────────────────────────────────────

function globToRegExp(glob: string): RegExp {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      // `**/` matches zero or more whole segments; a trailing `**` anything.
      if (glob[i + 2] === '/') {
        re += '(?:.*/)?'
        i += 2
      } else {
        re += '.*'
        i += 1
      }
    } else if (c === '*') re += '[^/]*'
    else if (c === '{') re += '(?:'
    else if (c === '}') re += ')'
    else if (c === ',') re += '|'
    else re += c.replace(/[.+?^$()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

const compiled = rules.map((r) => ({
  target: r.target,
  incremental: r.incremental,
  res: r.globs.map(globToRegExp),
}))

const ruleOf = (path: string) =>
  compiled.find((r) => r.res.some((re) => re.test(path)))

// ── File statuses ──────────────────────────────────────────────────────────

type Status =
  | 'landed'
  | 'pending'
  | 'drifted'
  | 'partial'
  | 'dropped'
  | 'UNASSIGNED'

interface Row {
  path: string
  target?: Target
  status: Status
}

function blobs(ref: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of git('ls-tree', '-r', '--full-tree', ref).split('\n')) {
    // "<mode> <type> <sha>\t<path>"
    const tab = line.indexOf('\t')
    if (tab < 0) continue
    map.set(line.slice(tab + 1), line.slice(0, tab).split(' ')[2])
  }
  return map
}

const batchById = new Map<BatchId, Batch>(batches.map((b) => [b.id, b]))

function buildRows(): Row[] {
  const known = existsSync(manifestPath)
    ? readFileSync(manifestPath, 'utf8').split('\n').filter(Boolean)
    : []
  const changed = git('diff', '--name-only', `${MAIN}...${BRANCH}`)
    .split('\n')
    .filter(Boolean)
  const paths = [...new Set([...known, ...changed])].sort()
  if (!flag('--no-write')) writeFileSync(manifestPath, `${paths.join('\n')}\n`)

  const onMain = blobs(MAIN)
  const onBranch = blobs(BRANCH)

  return paths.map((path) => {
    const rule = ruleOf(path)
    if (!rule) return { path, status: 'UNASSIGNED' }
    const { target } = rule
    if (typeof target === 'object') return { path, target, status: 'dropped' }
    if (onMain.get(path) === onBranch.get(path)) {
      return { path, target, status: 'landed' }
    }
    if (!batchById.get(target)?.merged) {
      return { path, target, status: 'pending' }
    }
    return { path, target, status: rule.incremental ? 'partial' : 'drifted' }
  })
}

// ── Smoke checklist ────────────────────────────────────────────────────────

type SmokeStatus =
  | 'on-main+tagged'
  | 'on-main-untagged'
  | 'pending'
  | 'GAP'
  | 'N/A'
  | 'MISSING-ON-BRANCH'

const fileCache = new Map<string, string | undefined>()
const show = (ref: string, path: string) => {
  const key = `${ref}:${path}`
  if (!fileCache.has(key)) fileCache.set(key, tryGit('show', key))
  return fileCache.get(key)
}

/** `@smoke` in the test's options object, i.e. between the title and its body. */
function isTagged(source: string, title: string): boolean {
  const at = source.indexOf(title)
  const body = source.indexOf('async', at)
  return source.slice(at, body < 0 ? at + 600 : body).includes('@smoke')
}

function smokeStatus(entry: SmokeEntry): SmokeStatus {
  if ('na' in entry) return 'N/A'
  if ('gap' in entry) return 'GAP'
  if (!entry.mainOnly && !show(BRANCH, entry.spec)?.includes(entry.title)) {
    return 'MISSING-ON-BRANCH'
  }
  const main = show(MAIN, entry.spec)
  if (!main?.includes(entry.title)) return 'pending'
  return isTagged(main, entry.title) ? 'on-main+tagged' : 'on-main-untagged'
}

// ── Worktrees ──────────────────────────────────────────────────────────────

function printWorktrees() {
  const list = git('worktree', 'list', '--porcelain')
  const rows: string[][] = []
  for (const block of list.split('\n\n').filter(Boolean)) {
    const path = /^worktree (.+)$/m.exec(block)?.[1]
    if (!path) continue
    const branch =
      /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? '(detached)'
    const head = /^HEAD (\w+)$/m.exec(block)?.[1] ?? ''
    // Commits on neither main nor the e2e branch: the work a removal would lose.
    const orphaned =
      tryGit('rev-list', '--count', head, '--not', MAIN, BRANCH)?.trim() ?? '?'
    const dirty = (tryGit('-C', path, 'status', '--porcelain') ?? '')
      .split('\n')
      .filter(Boolean).length
    const last = tryGit('log', '-1', '--format=%as', head)?.trim() ?? ''
    const verdict =
      orphaned === '0' && dirty === 0
        ? 'removable (confirm)'
        : 'decide: fold in or abandon'
    rows.push([
      path.replace(`${repoRoot}/`, ''),
      branch,
      orphaned,
      String(dirty),
      last,
      verdict,
    ])
  }
  console.log(
    '| Worktree | Branch | Orphaned commits | Dirty files | Last commit | Verdict |',
  )
  console.log('|---|---|---|---|---|---|')
  for (const r of rows) console.log(`| ${r.join(' | ')} |`)
}

// ── Ledger ─────────────────────────────────────────────────────────────────

const label = (t: Target | undefined) =>
  t === undefined ? 'UNASSIGNED' : typeof t === 'object' ? 'DROP' : t

function renderLedger(
  rows: Row[],
  smokeRows: [SmokeEntry, SmokeStatus][],
): string {
  return [
    '# Landing ledger: `e2e-tests-coverage` → `main`',
    '',
    `Generated by \`pnpm --filter @ens-apps/e2e landing\` from \`${MAIN}\` and \`${BRANCH}\`. Do not edit by hand — change \`e2e/landing/batches.ts\` and regenerate. Process and current state: [landing-handoff.md](./landing-handoff.md).`,
    '',
    ...renderBatches(rows),
    ...renderSmoke(smokeRows),
    ...renderFiles(rows),
  ].join('\n')
}

function renderBatches(rows: Row[]): string[] {
  const out: string[] = []
  out.push('## Batches')
  out.push('')
  out.push(
    '| Batch | Title | PR | Landed | Partial | Pending | Drifted | Total |',
  )
  out.push('|---|---|---|---|---|---|---|---|')
  for (const b of batches) {
    const mine = rows.filter((r) => r.target === b.id)
    const n = (s: Status) => mine.filter((r) => r.status === s).length
    const pr = b.pr ? `#${b.pr}${b.merged ? ' (merged)' : ''}` : ''
    out.push(
      `| ${b.id} | ${b.title} | ${pr} | ${n('landed')} | ${n('partial')} | ${n('pending')} | ${n('drifted')} | ${mine.length} |`,
    )
  }
  const dropped = rows.filter((r) => r.status === 'dropped').length
  const unassigned = rows.filter((r) => r.status === 'UNASSIGNED').length
  out.push(`| DROP | never lands | | | | | ${dropped} |`)
  if (unassigned)
    out.push(`| **UNASSIGNED** | fix batches.ts | | | | | ${unassigned} |`)
  out.push('')
  out.push(`${rows.length} paths in total.`)
  out.push('')
  return out
}

function renderSmoke(smokeRows: [SmokeEntry, SmokeStatus][]): string[] {
  const out: string[] = []
  out.push('## Smoke checklist')
  out.push('')
  out.push('| Flow | App | Version | Test | Status |')
  out.push('|---|---|---|---|---|')
  for (const [e, s] of smokeRows) {
    const test =
      'title' in e
        ? `${e.spec.replace('e2e/projects/', '')} → “${e.title}”`
        : 'gap' in e
          ? e.gap
          : e.na
    out.push(`| ${e.flow} | ${e.app} | ${e.version} | ${test} | ${s} |`)
  }
  out.push('')
  return out
}

function renderFiles(rows: Row[]): string[] {
  const out: string[] = []
  out.push('## Files')
  out.push('')
  const groups = [...batches.map((b) => b.id), 'DROP', 'UNASSIGNED']
  for (const g of groups) {
    const mine = rows.filter((r) => label(r.target) === g)
    if (!mine.length) continue
    const landed = mine.filter((r) => r.status === 'landed').length
    out.push(
      `<details><summary>${g} — ${landed}/${mine.length} landed</summary>`,
    )
    out.push('')
    out.push('| Path | Status |')
    out.push('|---|---|')
    for (const r of mine) {
      const why = typeof r.target === 'object' ? ` (${r.target.drop})` : ''
      out.push(`| \`${r.path}\` | ${r.status}${why} |`)
    }
    out.push('')
    out.push('</details>')
    out.push('')
  }
  return out
}

// ── Main ───────────────────────────────────────────────────────────────────

if (flag('--worktrees')) {
  printWorktrees()
  process.exit(0)
}

const rows = buildRows()

if (flag('--paths')) {
  const id = option('--batch', '')
  if (!batchById.has(id as BatchId)) {
    console.error(
      `--paths needs --batch <id>, one of ${batches.map((b) => b.id).join(', ')}`,
    )
    process.exit(2)
  }
  for (const r of rows) {
    if (r.target === id && r.status !== 'landed') console.log(r.path)
  }
  process.exit(0)
}

const smokeRows = smoke.map(
  (e) => [e, smokeStatus(e)] as [SmokeEntry, SmokeStatus],
)
if (!flag('--no-write'))
  writeFileSync(ledgerPath, `${renderLedger(rows, smokeRows)}\n`)

const count = (s: Status) => rows.filter((r) => r.status === s).length
const smokeCount = (s: SmokeStatus) =>
  smokeRows.filter(([, x]) => x === s).length
console.log(
  `${rows.length} paths: ${count('landed')} landed, ${count('partial')} partial, ${count('pending')} pending, ${count('drifted')} drifted, ${count('dropped')} dropped, ${count('UNASSIGNED')} unassigned`,
)
console.log(
  `smoke: ${smokeCount('on-main+tagged')} on main+tagged, ${smokeCount('on-main-untagged')} untagged, ${smokeCount('pending')} pending, ${smokeCount('GAP')} gaps, ${smokeCount('N/A')} n/a, ${smokeCount('MISSING-ON-BRANCH')} missing on branch`,
)

const problems: string[] = []
if (flag('--check') || flag('--discard-check')) {
  for (const r of rows)
    if (r.status === 'UNASSIGNED') problems.push(`unassigned: ${r.path}`)
  for (const [e, s] of smokeRows) {
    if (s === 'MISSING-ON-BRANCH' && 'title' in e) {
      problems.push(`smoke title not in ${e.spec}: “${e.title}”`)
    }
  }
}
if (flag('--discard-check')) {
  for (const r of rows) {
    if (r.status !== 'landed' && r.status !== 'dropped')
      problems.push(`${r.status}: ${r.path}`)
  }
  for (const [e, s] of smokeRows) {
    if (s !== 'on-main+tagged' && s !== 'N/A')
      problems.push(`smoke ${s}: ${e.flow} (${e.app} ${e.version})`)
  }
}
if (problems.length) {
  for (const p of problems) console.error(p)
  process.exit(1)
}
