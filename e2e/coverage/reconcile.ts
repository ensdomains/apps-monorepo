/**
 * Coverage reconciler — turns claims into measurements.
 *
 * `pnpm e2e:coverage`
 *
 * It answers one question per scenario in `scenarios.ts`: is this in a terminal
 * state (PASS / DEFECT / EXEMPT), and what is the evidence? Nothing here trusts
 * a status written by hand — every terminal state is derived from one of:
 *
 *   PASS    a committed, non-skipped, non-quarantined test tagged
 *           `@scenario:<id>` that a project config actually runs (and, when a
 *           results file is supplied with `--results`, that actually passed)
 *   DEFECT  a row in `e2e-defects.md` naming the scenario, *and* a committed
 *           test proving it — a defect with no failing test is not a defect
 *   EXEMPT  a written `exempt` block in the registry
 *
 * Everything else is non-terminal, including quarantined and skipped tests.
 *
 * Flags:
 *   --results <file>  Playwright JSON report; upgrades PASS from "a test exists"
 *                     to "a test ran and passed". Repeatable.
 *   --update          rewrite baseline.json with the current counts (never down)
 *   --json            print the machine-readable ledger instead of the summary
 *   --no-list         skip `playwright --list` (filesystem evidence only)
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { invariants, type Site, siteById } from './invariants.js'
import {
  type Scenario,
  scenarioById,
  scenarios,
  TIERS,
  type Tier,
} from './scenarios.js'

const here = dirname(fileURLToPath(import.meta.url))
const e2eRoot = resolve(here, '..')
const repoRoot = resolve(e2eRoot, '..')

const TAG_RE = /@scenario:([A-Za-z]+[0-9]+)/g
/** Invariant sweep tags — `@inv:INV1-transfer-plan`. */
const INV_TAG_RE = /@inv:(INV[1-5]-[a-z0-9-]+)/g
const QUARANTINE_TAG = '@quarantine'

/** Playwright configs the reconciler asks "what do you actually run?". */
const PROJECT_CONFIGS = [
  { project: 'manager', config: 'projects/manager/playwright.config.ts' },
  {
    project: 'manager-premium',
    config: 'projects/manager/playwright.premium.config.ts',
  },
  {
    project: 'manager-migration',
    config: 'projects/manager/playwright.migration.config.ts',
  },
  { project: 'portal', config: 'projects/portal/playwright.config.ts' },
  { project: 'cross-app', config: 'projects/cross-app/playwright.config.ts' },
  { project: 'metadata', config: 'projects/metadata/playwright.config.ts' },
]

type Status =
  | 'pass'
  | 'defect'
  | 'exempt'
  | 'quarantined'
  | 'skipped'
  | 'excluded'
  | 'defect-unproven'
  | 'not-started'

const TERMINAL: ReadonlySet<Status> = new Set<Status>([
  'pass',
  'defect',
  'exempt',
])

interface TaggedTest {
  file: string
  title: string
  tags: string[]
  /** `@inv:` sweep-site tags — orthogonal to `tags`; a test may carry both. */
  invTags: string[]
  skipped: boolean
  quarantined: boolean
  /** Which playwright configs list this test. Empty = committed but never run. */
  runBy: string[]
  /** From --results, when supplied. */
  outcome?: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted'
}

interface Defect {
  id: string
  scenario: string
  app: string
  severity: string
  summary: string
  status: string
}

interface Row {
  scenario: Scenario
  status: Status
  tests: TaggedTest[]
  defects: Defect[]
  evidence: string
}

// ── argv ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const hasFlag = (f: string) => argv.includes(f)
const resultsFiles = argv.flatMap((a, i) =>
  argv[i - 1] === '--results' ? [a] : [],
)

// ── 1. committed tests: filesystem scan ──────────────────────────────────

function specFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.spec.ts')) out.push(full)
    }
  }
  walk(join(e2eRoot, 'projects'))
  walk(join(e2eRoot, 'specs'))
  return out.sort()
}

/**
 * Scans a spec file for `@scenario:` tags and attributes each to the enclosing
 * `test(...)` / `test.describe(...)` call. Deliberately textual: it must work
 * without loading the app fixtures, and it must see tests a config excludes.
 */
function scanSpec(file: string): TaggedTest[] {
  const src = readFileSync(file, 'utf8')
  const rel = relative(e2eRoot, file)
  const lines = src.split('\n')
  const found: TaggedTest[] = []

  // A tag on `test.describe(...)` applies to every test inside it. Tracking
  // real block scope textually is not worth it — unioning every describe tag
  // in the file into every test is close enough for "is this covered", and
  // per-test tags stay exact.
  const describeTags = new Set<string>()
  const describeInvTags = new Set<string>()
  for (const line of lines) {
    if (/^\s*test\.describe\b/.test(line)) {
      for (const m of line.matchAll(TAG_RE)) describeTags.add(m[1])
      for (const m of line.matchAll(INV_TAG_RE)) describeInvTags.add(m[1])
    }
  }

  let current: {
    title: string
    buffer: string
    skipped: boolean
    startLine: number
  } | null = null
  const flush = () => {
    if (!current) return
    const tags = [
      ...new Set([
        ...[...current.buffer.matchAll(TAG_RE)].map((m) => m[1]),
        ...describeTags,
      ]),
    ]
    const invTags = [
      ...new Set([
        ...[...current.buffer.matchAll(INV_TAG_RE)].map((m) => m[1]),
        ...describeInvTags,
      ]),
    ]
    if (tags.length > 0 || invTags.length > 0) {
      found.push({
        file: rel,
        title: current.title,
        tags,
        invTags,
        skipped: current.skipped,
        quarantined: current.buffer.includes(QUARANTINE_TAG),
        runBy: [],
      })
    }
    current = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // The trailing quote is what separates a test *declaration* from an
    // in-body conditional `test.skip(cond, ...)`, which is not a test.
    const start = line.match(
      /^\s*(test|test\.skip|test\.fixme|test\.only)\s*\(\s*['"`]/,
    )
    if (start) {
      flush()
      current = {
        title: line,
        buffer: line,
        skipped: start[1] === 'test.skip' || start[1] === 'test.fixme',
        startLine: i + 1,
      }
      continue
    }
    if (current) {
      // A test's tags live in its first few lines (title string + tag option).
      if (i + 1 - current.startLine <= 6) current.buffer += `\n${line}`
      if (/^\s*(test|test\.describe)\b/.test(line)) flush()
    }
  }
  flush()

  // Normalise titles: keep the quoted title if we can find one.
  for (const t of found) {
    const quoted = t.title.match(/['"`]([^'"`]+)['"`]/)
    if (quoted) t.title = quoted[1]
  }
  return found
}

// ── 2. what the project configs actually run ─────────────────────────────

function listExecutable(): Map<string, string[]> {
  /** `${file}::${title}` → configs that run it. Also keyed by scenario tag. */
  const runBy = new Map<string, string[]>()
  if (hasFlag('--no-list')) return runBy

  for (const { project, config } of PROJECT_CONFIGS) {
    if (!existsSync(join(e2eRoot, config))) continue
    let json: string
    try {
      json = execFileSync(
        'pnpm',
        [
          'exec',
          'playwright',
          'test',
          `--config=${config}`,
          '--list',
          '--reporter=json',
        ],
        {
          cwd: e2eRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 32 * 1024 * 1024,
        },
      )
    } catch (err) {
      // An empty testDir is a hard error for playwright ("no tests found") but
      // a perfectly ordinary state here — cross-app is empty by definition
      // until P4 lands. Anything else is worth surfacing.
      const e = err as { stdout?: string; stderr?: string }
      const stdout = e.stdout ?? ''
      if (stdout.trim().startsWith('{')) {
        json = stdout
      } else {
        if (!/no tests found/i.test(`${e.stderr ?? ''}${stdout}`)) {
          console.warn(
            `⚠️  playwright --list failed for ${project}: ${(e.stderr ?? '').slice(0, 400)}`,
          )
        }
        continue
      }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(json.slice(json.indexOf('{')))
    } catch {
      console.warn(`⚠️  could not parse --list output for ${project}`)
      continue
    }

    for (const spec of walkSpecs(parsed)) {
      const key = `${spec.file}::${spec.title}`
      if (!existsSync(spec.file)) {
        console.warn(
          `⚠️  ${project}: could not resolve listed spec file ${spec.file}`,
        )
      }
      runBy.set(key, [...(runBy.get(key) ?? []), project])
      for (const tag of spec.tags) {
        const k = `tag::${tag}`
        runBy.set(k, [...new Set([...(runBy.get(k) ?? []), project])])
      }
    }
  }
  return runBy
}

interface ListedSpec {
  file: string
  title: string
  tags: string[]
  ok: boolean
}

/**
 * Playwright reports `file` relative to the config's `rootDir`, so every path
 * is resolved against it — otherwise nothing matches the filesystem scan.
 */
function walkSpecs(report: unknown): ListedSpec[] {
  const out: ListedSpec[] = []
  const rootDir = String((report as any)?.config?.rootDir ?? e2eRoot)
  const visit = (node: any, file?: string) => {
    if (!node || typeof node !== 'object') return
    const f = node.file ?? file
    for (const spec of node.specs ?? []) {
      // Scenario and invariant-site tags share the `tag::` key namespace —
      // their id shapes cannot collide (`GW3` vs `INV1-transfer-plan`).
      const both = (text: string) => [
        ...[...text.matchAll(TAG_RE)].map((m) => m[1]),
        ...[...text.matchAll(INV_TAG_RE)].map((m) => m[1]),
      ]
      const titleTags = both(String(spec.title ?? ''))
      const arrayTags = (spec.tags ?? []).flatMap((t: string) =>
        both(String(t)),
      )
      out.push({
        file: resolve(rootDir, String(spec.file ?? f ?? '')),
        title: String(spec.title ?? ''),
        tags: [...new Set([...titleTags, ...arrayTags])],
        ok: spec.ok !== false,
      })
    }
    for (const child of node.suites ?? []) visit(child, f)
  }
  for (const suite of (report as any)?.suites ?? []) visit(suite)
  return out
}

// ── 3. run outcomes (optional) ───────────────────────────────────────────

function loadOutcomes(): Map<string, TaggedTest['outcome']> {
  const outcomes = new Map<string, TaggedTest['outcome']>()
  for (const file of resultsFiles) {
    const path = resolve(process.cwd(), file)
    if (!existsSync(path)) {
      console.warn(`⚠️  results file not found: ${file}`)
      continue
    }
    const report = JSON.parse(readFileSync(path, 'utf8'))
    const rootDir = String(report?.config?.rootDir ?? e2eRoot)
    const visit = (node: any, f?: string) => {
      if (!node || typeof node !== 'object') return
      const nf = node.file ?? f
      for (const spec of node.specs ?? []) {
        const status: TaggedTest['outcome'] =
          spec.tests?.[0]?.results?.at(-1)?.status ?? undefined
        outcomes.set(
          `${resolve(rootDir, String(spec.file ?? nf ?? ''))}::${spec.title}`,
          status,
        )
        for (const m of String(spec.title ?? '').matchAll(TAG_RE)) {
          // Worst outcome wins. A scenario is only covered when *every* test
          // claiming it passes — see the note on the PASS decision below.
          const prev = outcomes.get(`tag::${m[1]}`)
          if (prev === undefined || prev === 'passed') {
            outcomes.set(`tag::${m[1]}`, status)
          }
        }
      }
      for (const child of node.suites ?? []) visit(child, nf)
    }
    for (const suite of report?.suites ?? []) visit(suite)
  }
  return outcomes
}

// ── 4. defect register ───────────────────────────────────────────────────

function loadDefects(): Defect[] {
  const path = join(e2eRoot, 'docs/e2e-defects.md')
  if (!existsSync(path)) return []
  const defects: Defect[] = []
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim())
    if (cells.length < 9) continue
    const [id, scenario, app, severity, summary, , , , status] = cells
    if (!/^E2E-\d+$/.test(id)) continue
    for (const sc of scenario
      .split(/[,/]/)
      .map((x) => x.trim().replace(/`/g, ''))
      .filter(Boolean)) {
      defects.push({
        id,
        scenario: sc,
        app,
        severity,
        summary,
        status: status.toLowerCase(),
      })
    }
  }
  return defects
}

// ── 5. harness evidence ──────────────────────────────────────────────────

function harnessStatus(
  row: Scenario,
  specSources: string,
  fixtureSources: string,
): { ok: boolean; evidence: string } {
  const modules = row.modules ?? []
  const missing = modules.filter((m) => !existsSync(join(e2eRoot, m)))
  if (missing.length > 0)
    return { ok: false, evidence: `missing: ${missing.join(', ')}` }
  // Every module, not just one of them: the P0 exit criterion is that the
  // helper is *used*, and a harness item whose oracle half nothing imports has
  // not been exercised no matter how many other files it ships alongside.
  //
  // "Used" includes reaching a spec through a Playwright fixture, which is the
  // normal way harness is consumed — a spec destructures `{ wallets }`, it does
  // not import `wallets.js`. So a module also counts when a fixture module a
  // spec imports pulls it in.
  const unused = modules.filter((m) => {
    const stem = m.replace(/\.ts$/, '').split('/').pop()
    if (!stem) return true
    const referenced = new RegExp(`${stem}(\\.js)?['"\`]`)
    return !referenced.test(specSources) && !referenced.test(fixtureSources)
  })
  if (unused.length > 0) {
    return {
      ok: false,
      evidence: `exists but no spec imports ${unused.join(', ')}`,
    }
  }
  return { ok: true, evidence: `${modules.join(', ')} imported by a spec` }
}

// ── 6. reconcile ─────────────────────────────────────────────────────────

const allSpecFiles = specFiles()
const specSources = allSpecFiles.map((f) => readFileSync(f, 'utf8')).join('\n')

/**
 * Fixture modules a spec pulls in transitively. Harness reaches a spec through
 * fixture injection far more often than through a direct import, so a module
 * referenced here counts as used — see {@link harnessStatus}.
 */
const fixtureSources = readdirSync(join(e2eRoot, 'fixtures'))
  .filter((f) => f.endsWith('.ts'))
  .map((f) => readFileSync(join(e2eRoot, 'fixtures', f), 'utf8'))
  .join('\n')
const taggedTests = allSpecFiles.flatMap(scanSpec)
const executable = listExecutable()
const outcomes = loadOutcomes()
const defects = loadDefects()

for (const t of taggedTests) {
  const allTags = [...t.tags, ...t.invTags]
  t.runBy =
    executable.get(`${join(e2eRoot, t.file)}::${t.title}`) ??
    allTags.flatMap((tag) => executable.get(`tag::${tag}`) ?? [])
  t.outcome =
    outcomes.get(`${join(e2eRoot, t.file)}::${t.title}`) ??
    allTags.map((tag) => outcomes.get(`tag::${tag}`)).find(Boolean)
}

/** Hard failures — a false claim in the ledger, or a ratchet regression. */
const problems: string[] = []
/**
 * Diagnostics. An excluded test is a gap in the *runner config*, not a false
 * claim: the ledger already refuses to count it as terminal, so it does not
 * need to also break the build.
 */
const warnings: string[] = []

// Tags that name a scenario or an invariant site the registry has never heard
// of. Both are hard failures: a tag pointing at nothing is a coverage claim
// with no definition behind it.
for (const t of taggedTests) {
  for (const tag of t.tags) {
    if (!scenarioById.has(tag)) {
      problems.push(
        `unknown scenario tag @scenario:${tag} in ${t.file} — "${t.title}"`,
      )
    }
  }
  for (const tag of t.invTags) {
    if (!siteById.has(tag)) {
      problems.push(
        `unknown invariant site tag @inv:${tag} in ${t.file} — "${t.title}"`,
      )
    }
  }
}

const rows: Row[] = scenarios.map((scenario) => {
  const tests = taggedTests.filter((t) => t.tags.includes(scenario.id))
  const open = defects.filter(
    (d) => d.scenario === scenario.id && d.status !== 'verified',
  )

  if (scenario.exempt) {
    return {
      scenario,
      status: 'exempt',
      tests,
      defects: open,
      evidence: scenario.exempt.reason,
    }
  }

  if (scenario.kind === 'harness') {
    const h = harnessStatus(scenario, specSources, fixtureSources)
    return {
      scenario,
      status: h.ok ? 'pass' : 'not-started',
      tests,
      defects: open,
      evidence: h.evidence,
    }
  }

  if (tests.length === 0) {
    if (open.length > 0) {
      problems.push(
        `${scenario.id}: defect ${open.map((d) => d.id).join(', ')} filed with no test proving it`,
      )
      return {
        scenario,
        status: 'defect-unproven',
        tests,
        defects: open,
        evidence: 'no covering test',
      }
    }
    return {
      scenario,
      status: 'not-started',
      tests,
      defects: open,
      evidence: '—',
    }
  }

  if (open.length > 0) {
    return {
      scenario,
      status: 'defect',
      tests,
      defects: open,
      evidence: `${open.map((d) => `${d.id} ${d.severity}`).join(', ')} · ${tests.length} test(s)`,
    }
  }

  const live = tests.filter((t) => !t.skipped && !t.quarantined)
  if (live.length === 0) {
    const quarantined = tests.some((t) => t.quarantined)
    if (!quarantined) {
      problems.push(
        `${scenario.id}: every covering test is skipped and there is no EXEMPT entry`,
      )
    }
    return {
      scenario,
      status: quarantined ? 'quarantined' : 'skipped',
      tests,
      defects: open,
      evidence: tests.map((t) => t.file).join(', '),
    }
  }

  const run = live.filter((t) => t.runBy.length > 0)
  if (run.length === 0) {
    warnings.push(
      `${scenario.id}: covering test exists but no playwright config runs it (${live[0].file})`,
    )
    return {
      scenario,
      status: 'excluded',
      tests,
      defects: open,
      evidence: `${live[0].file} — excluded by every project config`,
    }
  }

  // A results file is usually partial — one batch, one project, one --grep.
  // Only scenarios it actually reports on are judged by it; the rest keep
  // their static evidence. Otherwise running a five-test batch would downgrade
  // every other scenario in the ledger and trip the ratchet.
  // **Every** covering test must pass, not just one.
  //
  // This used to be "best outcome wins", which is wrong in both directions.
  // Many catalogue rows are matrices — F10 names six recipient forms, and there
  // is a test per form — so any-one-passes made the row green on a single
  // input. And it hid partial regressions: `A16` stayed PASS with one of its
  // two tests failing. Requiring all of them is what makes it honest to tag a
  // per-case test at all, which is otherwise forbidden by the no-partial-tags
  // rule.
  const reported = run.filter((t) => t.outcome !== undefined)
  if (reported.length > 0) {
    const notPassing = reported.filter((t) => t.outcome !== 'passed')
    if (notPassing.length > 0) {
      return {
        scenario,
        status: 'not-started',
        tests,
        defects: open,
        evidence:
          `${notPassing.length}/${reported.length} covering test(s) did not pass: ` +
          notPassing.map((t) => `"${t.title}" (${t.outcome})`).join(', '),
      }
    }
    return {
      scenario,
      status: 'pass',
      tests,
      defects: open,
      evidence: `all ${reported.length} covering test(s) passing in ${[...new Set(reported.flatMap((t) => t.runBy))].join(', ')}`,
    }
  }

  return {
    scenario,
    status: 'pass',
    tests,
    defects: open,
    evidence: `${run.length} test(s) in ${[...new Set(run.flatMap((t) => t.runBy))].join(', ')}`,
  }
})

// ── 7. rollups ───────────────────────────────────────────────────────────

interface TierCount {
  total: number
  terminal: number
  pass: number
  defect: number
  exempt: number
  quarantined: number
  skipped: number
  excluded: number
  notStarted: number
}

const emptyCount = (): TierCount => ({
  total: 0,
  terminal: 0,
  pass: 0,
  defect: 0,
  exempt: 0,
  quarantined: 0,
  skipped: 0,
  excluded: 0,
  notStarted: 0,
})

const byTier = new Map<Tier, TierCount>(TIERS.map((t) => [t, emptyCount()]))
for (const row of rows) {
  const c = byTier.get(row.scenario.tier)
  if (!c) continue
  c.total++
  if (TERMINAL.has(row.status)) c.terminal++
  if (row.status === 'pass') c.pass++
  else if (row.status === 'defect') c.defect++
  else if (row.status === 'exempt') c.exempt++
  else if (row.status === 'quarantined') c.quarantined++
  else if (row.status === 'skipped') c.skipped++
  else if (row.status === 'excluded') c.excluded++
  else c.notStarted++
}

// ── 7b. invariant sweeps (Track B) ───────────────────────────────────────
//
// A site is `checked` on exactly the evidence a scenario is PASS on: a
// committed, non-skipped, non-quarantined test carrying its `@inv:` tag that a
// project config actually runs. Anything weaker is `unchecked` — the sweep's
// value is that it can state what it has *not* looked at.

type SiteStatus = 'checked' | 'exempt' | 'excluded' | 'unchecked'

interface SiteRow {
  site: Site
  status: SiteStatus
  evidence: string
}

const siteRows: SiteRow[] = invariants.flatMap((inv) =>
  inv.sites.map((site): SiteRow => {
    if (site.exempt)
      return { site, status: 'exempt', evidence: site.exempt.reason }
    const tests = taggedTests.filter((t) => t.invTags.includes(site.id))
    const live = tests.filter((t) => !t.skipped && !t.quarantined)
    const run = live.filter((t) => t.runBy.length > 0)
    if (run.length === 0) {
      if (live.length > 0) {
        warnings.push(
          `${site.id}: sweep test exists but no playwright config runs it (${live[0].file})`,
        )
        return {
          site,
          status: 'excluded',
          evidence: `${live[0].file} — excluded by every project config`,
        }
      }
      return { site, status: 'unchecked', evidence: '—' }
    }
    const reported = run.filter((t) => t.outcome !== undefined)
    if (reported.length > 0 && !reported.some((t) => t.outcome === 'passed')) {
      return {
        site,
        status: 'unchecked',
        evidence: `ran but did not pass (${reported.map((t) => t.outcome).join(', ')})`,
      }
    }
    return {
      site,
      status: 'checked',
      evidence: `${run.length} test(s) in ${[...new Set(run.flatMap((t) => t.runBy))].join(', ')}`,
    }
  }),
)

const sitesChecked = siteRows.filter(
  (r) => r.status === 'checked' || r.status === 'exempt',
).length

const openBySeverity = defects
  .filter((d) => d.status === 'open' || d.status === 'triaged')
  .reduce<Record<string, number>>((acc, d) => {
    acc[d.severity] = (acc[d.severity] ?? 0) + 1
    return acc
  }, {})

// ── 8. the ratchet ───────────────────────────────────────────────────────

const baselinePath = join(here, 'baseline.json')
interface Baseline {
  updated: string
  note: string
  tiers: Record<string, number>
  totalTerminal: number
  invariantSitesChecked: number
  /** Frozen P0–P6 counts from the superseded phase model. Audit trail only. */
  phasesLegacy?: Record<string, number>
}

const baseline: Baseline = existsSync(baselinePath)
  ? JSON.parse(readFileSync(baselinePath, 'utf8'))
  : {
      updated: 'never',
      note: 'Terminal scenario counts per risk tier. May only increase — see e2e-build-goal.md §16.5.',
      tiers: Object.fromEntries(TIERS.map((t) => [t, 0])),
      totalTerminal: 0,
      invariantSitesChecked: 0,
    }

const totalTerminal = rows.filter((r) => TERMINAL.has(r.status)).length
const regressions = [
  ...TIERS.flatMap((t) => {
    const now = byTier.get(t)?.terminal ?? 0
    const was = baseline.tiers?.[t] ?? 0
    return now < was ? [`${t}: terminal ${was} → ${now}`] : []
  }),
  ...(sitesChecked < (baseline.invariantSitesChecked ?? 0)
    ? [
        `invariant sites checked ${baseline.invariantSitesChecked} → ${sitesChecked}`,
      ]
    : []),
]

if (hasFlag('--update')) {
  const next: Baseline = {
    updated: new Date().toISOString().slice(0, 10),
    note: baseline.note,
    tiers: Object.fromEntries(
      TIERS.map((t) => [
        t,
        Math.max(baseline.tiers?.[t] ?? 0, byTier.get(t)?.terminal ?? 0),
      ]),
    ),
    totalTerminal: Math.max(baseline.totalTerminal ?? 0, totalTerminal),
    invariantSitesChecked: Math.max(
      baseline.invariantSitesChecked ?? 0,
      sitesChecked,
    ),
    ...(baseline.phasesLegacy ? { phasesLegacy: baseline.phasesLegacy } : {}),
  }
  writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`)
  console.log(`✅ baseline updated → ${relative(repoRoot, baselinePath)}`)
}

// ── 9. report ────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<Status, string> = {
  pass: 'PASS',
  defect: 'DEFECT',
  exempt: 'EXEMPT',
  quarantined: 'quarantined',
  skipped: 'skipped',
  excluded: 'excluded',
  'defect-unproven': 'defect-unproven',
  'not-started': 'not-started',
}

const TIER_NAME: Record<Tier, string> = {
  HW: 'Harness',
  R0: 'Irreversible & one-shot',
  R1: 'Financial',
  R2: 'Authorization',
  R3: 'Display correctness',
  R4: 'Resilience & quality',
}

const SITE_LABEL: Record<SiteStatus, string> = {
  checked: 'checked',
  exempt: 'EXEMPT',
  excluded: 'excluded',
  unchecked: 'unchecked',
}

function writeReport() {
  const lines: string[] = []
  lines.push('# E2E coverage — generated')
  lines.push('')
  lines.push('<!-- Generated by `pnpm e2e:coverage`. Do not hand-edit. -->')
  lines.push('')
  lines.push(
    `Terminal: **${totalTerminal} / ${rows.length}** scenarios ` +
      `(PASS ${rows.filter((r) => r.status === 'pass').length} · ` +
      `DEFECT ${rows.filter((r) => r.status === 'defect').length} · ` +
      `EXEMPT ${rows.filter((r) => r.status === 'exempt').length})`,
  )
  lines.push('')
  lines.push(
    outcomes.size > 0
      ? 'Evidence mode: **run results** — scenarios covered by the supplied report are judged on whether they actually passed; the rest keep their static evidence.'
      : 'Evidence mode: **static** — PASS means a committed, non-skipped test exists and a project config runs it. Re-run with `--results <playwright.json>` to verify against a real run.',
  )
  lines.push('')
  lines.push('## Risk tiers')
  lines.push('')
  lines.push(
    'Ordered by cost of being wrong (`e2e-build-goal.md` §8). Work R0 first.',
  )
  lines.push('')
  lines.push(
    '| Tier | Scope | Terminal | PASS | DEFECT | EXEMPT | quarantined | skipped | excluded | not-started |',
  )
  lines.push('|---|---|---|---|---|---|---|---|---|---|')
  for (const t of TIERS) {
    const c = byTier.get(t)
    if (!c) continue
    lines.push(
      `| **${t}** | ${TIER_NAME[t]} | ${c.terminal}/${c.total} | ${c.pass} | ${c.defect} | ${c.exempt} | ${c.quarantined} | ${c.skipped} | ${c.excluded} | ${c.notStarted} |`,
    )
  }
  lines.push('')
  lines.push('## Invariant sweeps')
  lines.push('')
  lines.push(
    `Sites checked: **${sitesChecked} / ${siteRows.length}**. ` +
      'A site is `checked` on the same evidence a scenario is PASS on — a committed, ' +
      'non-skipped test carrying its `@inv:` tag that a project config runs.',
  )
  lines.push('')
  lines.push('| Invariant | Statement | Sites checked |')
  lines.push('|---|---|---|')
  for (const inv of invariants) {
    const mine = siteRows.filter((r) => r.site.invariant === inv.id)
    const done = mine.filter(
      (r) => r.status === 'checked' || r.status === 'exempt',
    ).length
    lines.push(`| **${inv.id}** | ${inv.statement} | ${done}/${mine.length} |`)
  }
  lines.push('')
  lines.push('| Site | Invariant | Surface | Status | Evidence |')
  lines.push('|---|---|---|---|---|')
  for (const r of siteRows) {
    lines.push(
      `| \`${r.site.id}\` | ${r.site.invariant} | ${r.site.title} | ${SITE_LABEL[r.status]} | ${r.evidence} |`,
    )
  }
  lines.push('')
  lines.push('## Open defects')
  lines.push('')
  const openDefects = defects.filter(
    (d) => d.status === 'open' || d.status === 'triaged',
  )
  if (openDefects.length === 0) {
    lines.push('None.')
  } else {
    lines.push('| ID | Scenario | Sev | Status | Summary |')
    lines.push('|---|---|---|---|---|')
    for (const d of openDefects) {
      lines.push(
        `| ${d.id} | ${d.scenario} | ${d.severity} | ${d.status} | ${d.summary} |`,
      )
    }
  }
  lines.push('')
  if (warnings.length > 0) {
    lines.push('## Coverage that never runs')
    lines.push('')
    lines.push(
      'Committed tests that no project config executes. Not counted as terminal.',
    )
    lines.push('')
    for (const w of warnings) lines.push(`- ${w}`)
    lines.push('')
  }
  lines.push('## Scenarios')
  lines.push('')
  for (const t of TIERS) {
    const tierRows = rows.filter((r) => r.scenario.tier === t)
    if (tierRows.length === 0) continue
    lines.push(`### ${t} — ${TIER_NAME[t]}`)
    lines.push('')
    lines.push('| ID | § | Scenario | Status | Evidence |')
    lines.push('|---|---|---|---|---|')
    for (const r of tierRows) {
      const id = r.scenario.planId
        ? `${r.scenario.id} <sub>(${r.scenario.planId})</sub>`
        : r.scenario.id
      lines.push(
        `| ${id} | ${r.scenario.section} | ${r.scenario.title} | ${STATUS_LABEL[r.status]} | ${r.evidence} |`,
      )
    }
    lines.push('')
  }
  const path = join(e2eRoot, 'docs/e2e-coverage.md')
  writeFileSync(path, `${lines.join('\n')}\n`)
  return path
}

const reportPath = writeReport()

if (hasFlag('--json')) {
  console.log(
    JSON.stringify(
      {
        totalTerminal,
        total: rows.length,
        tiers: Object.fromEntries([...byTier].map(([t, c]) => [t, c])),
        invariantSites: { checked: sitesChecked, total: siteRows.length },
        rows: rows.map((r) => ({
          id: r.scenario.id,
          tier: r.scenario.tier,
          phase: r.scenario.phase,
          section: r.scenario.section,
          status: r.status,
          evidence: r.evidence,
          tests: r.tests.map((t) => `${t.file}::${t.title}`),
        })),
        sites: siteRows.map((r) => ({
          id: r.site.id,
          invariant: r.site.invariant,
          status: r.status,
          evidence: r.evidence,
        })),
        problems,
        warnings,
      },
      null,
      2,
    ),
  )
} else {
  for (const t of TIERS) {
    const c = byTier.get(t)
    if (!c) continue
    const extra = [
      c.quarantined > 0 ? `quarantined ${c.quarantined}` : '',
      c.skipped > 0 ? `skipped ${c.skipped}` : '',
      c.excluded > 0 ? `excluded ${c.excluded}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
    console.log(`${t} (${TIER_NAME[t]}) — ${c.terminal}/${c.total} terminal`)
    console.log(
      `  PASS ${c.pass} · DEFECT ${c.defect} · EXEMPT ${c.exempt} · not-started ${c.notStarted}${extra ? ` · ${extra}` : ''}`,
    )
  }
  console.log('')
  for (const inv of invariants) {
    const mine = siteRows.filter((r) => r.site.invariant === inv.id)
    const done = mine.filter(
      (r) => r.status === 'checked' || r.status === 'exempt',
    ).length
    console.log(`${inv.id} — ${done}/${mine.length} sites checked`)
  }
  console.log('')
  const sev = Object.entries(openBySeverity)
    .sort()
    .map(([k, v]) => `${k} ${v}`)
    .join(' · ')
  console.log(`Open defects: ${sev || 'none'}`)
  console.log(`Terminal overall: ${totalTerminal}/${rows.length}`)
  console.log(`Invariant sites checked: ${sitesChecked}/${siteRows.length}`)
  console.log(`Report: ${relative(repoRoot, reportPath)}`)
}

if (warnings.length > 0) {
  console.error('')
  console.error('Coverage that never runs:')
  for (const w of warnings) console.error(`  ⚠ ${w}`)
}
if (problems.length > 0) {
  console.error('')
  console.error('Reconciler problems:')
  for (const p of problems) console.error(`  ✗ ${p}`)
}
if (regressions.length > 0) {
  console.error('')
  console.error('Ratchet regression (baseline may only increase):')
  for (const r of regressions) console.error(`  ✗ ${r}`)
}

if (problems.length > 0 || regressions.length > 0) process.exit(1)
