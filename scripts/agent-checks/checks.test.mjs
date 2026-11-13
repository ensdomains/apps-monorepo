import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  applyMissingTests,
  formatLogRecord,
  guardCommand,
  missingRelatedTests,
  packagesFor,
  readCachedVerdict,
  repeatedStopVerdict,
  reviewBranch,
  reviewDiff,
  reviewPrBody,
  selectBase,
  verificationKey,
  vitestTargets,
  writeCachedVerdict,
} from './lib.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function verdictFrom(stdout) {
  const line = stdout.split('\n').find((entry) => entry.startsWith('{'))
  if (!line) throw new Error(`no JSON verdict in ${stdout}`)
  return JSON.parse(line)
}

test('guard-command blocks the banned typecheck and full-suite forms', () => {
  const blocked = [
    'npx tsc --noEmit',
    'pnpx tsc',
    'pnpm exec tsc --noEmit',
    './node_modules/.bin/tsc --noEmit',
    'tsc -p apps/portal',
    'pnpm test',
    'pnpm test:all',
    'pnpm -r test',
    'pnpm --recursive test',
    'pnpm exec vitest run --maxWorkers=4',
    'cd apps/portal && npx tsc',
  ]
  for (const command of blocked) {
    assert.equal(guardCommand(command).decision, 'block', command)
  }
})

test('guard-command allows the documented commands', () => {
  const allowed = [
    'cd apps/manager && pnpm typecheck',
    'pnpm --filter "...[origin/main]" --filter "!{.}" typecheck',
    'pnpm exec vitest run --maxWorkers=4 src/features/renew',
    'pnpm --filter portal test',
    'pnpm test:manager',
  ]
  for (const command of allowed) {
    assert.equal(guardCommand(command).decision, 'allow', command)
  }
  assert.match(guardCommand('npx tsc').reason, /pnpm typecheck/)
  assert.match(guardCommand('pnpm test').reason, /vitest run/)
})

test('root pnpm typecheck is rejected before it runs', () => {
  const rootDir = '/repo/apps-monorepo'
  const blocked = guardCommand('pnpm typecheck', { cwd: rootDir })
  assert.equal(blocked.decision, 'block')
  assert.match(blocked.reason, /\(cd apps\/<app> && pnpm typecheck\)/)
  assert.equal(guardCommand('pnpm run typecheck', { cwd: rootDir }).decision, 'block')
  assert.equal(
    guardCommand('cd apps/manager && pnpm typecheck', { cwd: rootDir }).decision,
    'allow',
  )
  assert.equal(guardCommand('pnpm typecheck', { cwd: `${rootDir}/apps/manager` }).decision, 'allow')
  assert.equal(
    guardCommand('pnpm --filter manager typecheck', { cwd: rootDir }).decision,
    'allow',
  )
  assert.equal(guardCommand('pnpm -C apps/portal typecheck', { cwd: rootDir }).decision, 'allow')
})

test('diff review flags added violations and ignores context, comments, and prefix bangs', () => {
  const diff = [
    'diff --git a/src/pay.ts b/src/pay.ts',
    '--- a/src/pay.ts',
    '+++ b/src/pay.ts',
    '@@ -1,2 +1,8 @@',
    ' const keep = 1',
    '-const gone: any = 1',
    '+const value: any = 1',
    '+const ready = !value',
    '+const asserted = value!',
    '+const same = value !== null',
    '+// as any is discussed here',
    '+const label = "company"',
    '',
  ].join('\n')
  const review = reviewDiff(diff)
  const rules = review.findings.map((finding) => finding.rule)
  assert.deepEqual(rules, ['no-any', 'no-non-null'])
  assert.equal(review.decision, 'feedback')
})

test('diff review flags result, effect, client, and test-weakening patterns', () => {
  const diff = [
    'diff --git a/src/Widget.tsx b/src/Widget.tsx',
    '--- a/src/Widget.tsx',
    '+++ b/src/Widget.tsx',
    '@@ -0,0 +1,6 @@',
    '+useEffect(() => {',
    '+  fetch("/names")',
    '+  startTransaction()',
    '+})',
    '+createPublicClient({ transport })',
    '+try { return err(new Error("x")) } catch (error) { return errAsync(error) }',
    '+Promise.resolve().then(() => save())',
    'diff --git a/src/widget.test.ts b/src/widget.test.ts',
    '--- a/src/widget.test.ts',
    '+++ b/src/widget.test.ts',
    '@@ -1,2 +1,3 @@',
    '-    expect(value).toEqual(1)',
    '+    expect(value).toBeTruthy()',
    '+    it.skip("later", () => {})',
    '+    const client = {} as unknown as WalletClient',
    '',
  ].join('\n')
  const rules = reviewDiff(diff).findings.map((finding) => finding.rule)
  assert.ok(rules.includes('no-effect-fetch'))
  assert.ok(rules.includes('no-effect-tx'))
  assert.ok(rules.includes('no-viem-client'))
  assert.ok(rules.includes('no-result-try'))
  assert.ok(rules.includes('no-promise-wrap'))
  assert.ok(rules.includes('no-loose-matcher'))
  assert.ok(rules.includes('no-focused-test'))
  assert.ok(rules.includes('no-suppression'))
})

test('a clean diff that touches transaction-manager asks for its AGENTS.md', () => {
  const diff = [
    'diff --git a/packages/transaction-manager/src/note.ts b/packages/transaction-manager/src/note.ts',
    '--- /dev/null',
    '+++ b/packages/transaction-manager/src/note.ts',
    '@@ -0,0 +1 @@',
    '+export const NOTE = "ok"',
    '',
  ].join('\n')
  const review = reviewDiff(diff)
  assert.equal(review.decision, 'allow')
  assert.match(review.context, /packages\/transaction-manager\/AGENTS.md/)
})

test('pr body keeps behaviour inside Regression check', () => {
  const diff = [
    'diff --git a/src/price.test.ts b/src/price.test.ts',
    '--- a/src/price.test.ts',
    '+++ b/src/price.test.ts',
    '@@ -1 +1 @@',
    '-expect(price).toBe(1)',
    '+expect(price).toBe(2)',
    '',
  ].join('\n')
  assert.equal(reviewPrBody(undefined, diff).decision, 'allow')
  assert.equal(reviewPrBody('## Regression check\nnone\n', diff).decision, 'block')
  const outside = [
    '## Regression check',
    'Callers checked: price helpers.',
    '## Behaviour changes for users',
    'The price is 2.',
    '',
  ].join('\n')
  assert.equal(reviewPrBody(outside, diff).decision, 'block')
  const inside = [
    '## Regression check',
    'Callers checked: price helpers.',
    'Tests: price.test.ts now expects 2.',
    'Behaviour verified: the displayed price is 2.',
    '',
  ].join('\n')
  assert.equal(reviewPrBody(inside, diff).decision, 'allow')
  const summaryOnly = [
    '## Summary',
    'Behaviour verified: the price is 2.',
    '',
    '## Regression check',
    'Callers checked: price helpers.',
    '',
  ].join('\n')
  assert.equal(reviewPrBody(summaryOnly, diff).decision, 'block')
})

test('branch name stays quiet unless a ticket id is known', () => {
  assert.equal(reviewBranch({ branch: 'cursor/example-a529' }).decision, 'allow')
  const mismatch = reviewBranch({
    branch: 'cursor/example-a529',
    ticketId: 'WEB-1',
  })
  assert.equal(mismatch.decision, 'feedback')
  assert.equal(
    reviewBranch({ branch: 'cursor/example-a529', ticketId: 'WEB-1' }, { strict: true }).decision,
    'block',
  )
  assert.equal(reviewBranch({ branch: 'linear/web-1', ticketId: 'WEB-1' }).decision, 'allow')
})

test('verify targets stay inside the changed package', () => {
  assert.deepEqual(packagesFor(['apps/manager/src/a.ts', 'README.md']), ['apps/manager'])
  const exists = (file) => file === 'apps/manager/src/price.test.ts'
  assert.deepEqual(
    vitestTargets('apps/manager', ['apps/manager/src/price.ts', 'apps/portal/src/price.ts'], exists),
    ['src/price.test.ts'],
  )
})

test('guard-command exits 2, and report-only does not', () => {
  const runner = path.join(root, 'scripts/agent-checks/run.mjs')
  const blocked = spawnSync(process.execPath, [runner, 'guard-command', '--command', 'npx tsc'], {
    encoding: 'utf8',
  })
  assert.equal(blocked.status, 2)
  assert.equal(verdictFrom(blocked.stdout).decision, 'block')
  const reported = spawnSync(
    process.execPath,
    [runner, 'guard-command', '--command', 'npx tsc', '--report-only'],
    { encoding: 'utf8' },
  )
  assert.equal(reported.status, 0)
  assert.equal(verdictFrom(reported.stdout).decision, 'block')
})

test('claude adapter denies npx tsc and does not re-enter a stop hook', () => {
  const adapter = path.join(root, 'scripts/agent-checks/claude-codex-hook.mjs')
  const denied = spawnSync(process.execPath, [adapter], {
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npx tsc --noEmit' },
    }),
    encoding: 'utf8',
  })
  assert.equal(denied.status, 0)
  assert.equal(JSON.parse(denied.stdout).hookSpecificOutput.permissionDecision, 'deny')

  const stopped = spawnSync(process.execPath, [adapter], {
    input: JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: true }),
    encoding: 'utf8',
  })
  assert.equal(stopped.status, 0)
  assert.equal(stopped.stdout, '')
})

test('a runtime change without a related test is feedback, and a paired test clears it', () => {
  const source = 'apps/manager/src/names/mergedNames.ts'
  const testFile = 'apps/manager/src/names/mergedNames.test.ts'
  assert.deepEqual(missingRelatedTests([source]), [source])
  assert.deepEqual(missingRelatedTests([source, testFile]), [])
  assert.deepEqual(missingRelatedTests([`${source.replace(/\.ts$/, '.spec.ts')}`, source]), [])
  assert.deepEqual(missingRelatedTests(['packages/utils/src/clock.gen.ts', 'apps/manager/src/row.stories.tsx']), [])
  const review = applyMissingTests(
    { decision: 'allow', reason: '', findings: [] },
    [source],
  )
  assert.equal(review.decision, 'feedback')
  assert.match(review.reason, /writing-tests/)
  assert.match(review.reason, /do not replace/i)
})

test('verification cache and log records round-trip', () => {
  assert.equal(verificationKey(['a', 'b']), verificationKey(['a', 'b']))
  assert.notEqual(verificationKey(['a']), verificationKey(['b']))
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-checks-'))
  assert.equal(readCachedVerdict(dir, 'missing'), null)
  writeCachedVerdict(dir, 'abc', { decision: 'block', reason: 'no test' })
  assert.deepEqual(readCachedVerdict(dir, 'abc'), { decision: 'block', reason: 'no test' })
  const line = formatLogRecord({
    timestamp: '2026-11-13T00:00:00.000Z',
    agent: 'codex',
    event: 'Stop',
    check: 'verify',
    verdict: 'allow',
    durationMs: 4,
  })
  assert.equal(line.includes('\n'), false)
  assert.deepEqual(JSON.parse(line), {
    timestamp: '2026-11-13T00:00:00.000Z',
    agent: 'codex',
    event: 'Stop',
    check: 'verify',
    verdict: 'allow',
    durationMs: 4,
  })
})

test('stop blocks once per tree', () => {
  assert.equal(repeatedStopVerdict(null), null)
  assert.deepEqual(repeatedStopVerdict({ decision: 'block', reason: 'missing tests' }), {
    decision: 'feedback',
    reason: 'already reported',
  })
  assert.equal(repeatedStopVerdict({ decision: 'allow', reason: '' }).decision, 'allow')
  const tree = verificationKey(['sha-a', 'diff-a'])
  assert.equal(tree, verificationKey(['sha-a', 'diff-a']))
  assert.notEqual(tree, verificationKey(['sha-b', 'diff-a']))
})

test('session base reviews only changes made after the session started', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-checks-repo-'))
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  }
  const git = (args) =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      env: gitEnv,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  git(['init', '-b', 'main'])
  const oldFile = path.join(dir, 'apps/manager/src/old.ts')
  mkdirSync(path.dirname(oldFile), { recursive: true })
  writeFileSync(oldFile, 'export const old = 1\n')
  git(['add', '.'])
  git(['commit', '-m', 'main'])
  const main = git(['rev-parse', 'HEAD'])
  const preFile = path.join(dir, 'apps/manager/src/pre.ts')
  writeFileSync(preFile, 'export const pre = 1\n')
  git(['add', '.'])
  git(['commit', '-m', 'before session'])
  const session = git(['rev-parse', 'HEAD'])
  const source = 'apps/manager/src/names/mergedNames.ts'
  const testFile = 'apps/manager/src/names/mergedNames.test.ts'
  mkdirSync(path.join(dir, 'apps/manager/src/names'), { recursive: true })
  writeFileSync(path.join(dir, source), 'export const days = 60\n')
  writeFileSync(path.join(dir, testFile), 'export const covered = true\n')
  git(['add', '.'])
  git(['commit', '-m', 'session work'])
  const head = git(['rev-parse', 'HEAD'])
  assert.equal(
    selectBase({
      explicit: '',
      sessionStart: session,
      envBase: '',
      upstreamMergeBase: main,
      originMain: main,
    }),
    session,
  )
  assert.equal(selectBase({ explicit: '', sessionStart: '', envBase: 'env', upstreamMergeBase: main, originMain: main }), 'env')
  assert.equal(selectBase({ explicit: '', sessionStart: '', envBase: '', upstreamMergeBase: main, originMain: 'origin/main' }), main)
  const sessionFiles = git(['diff', '--name-only', session, head]).split('\n').filter(Boolean).sort()
  assert.deepEqual(sessionFiles, [testFile, source].sort())
  assert.deepEqual(missingRelatedTests(sessionFiles), [])
  const mainFiles = git(['diff', '--name-only', main, head]).split('\n').filter(Boolean)
  assert.ok(missingRelatedTests(mainFiles).includes('apps/manager/src/pre.ts'))
  assert.equal(missingRelatedTests(sessionFiles).includes('apps/manager/src/pre.ts'), false)
})

test('a missing hook script is reported once', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-checks-hook-'))
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir, stdio: 'ignore' })
  const hook = path.join(root, 'scripts/agent-checks/hook.sh')
  const env = {
    ...process.env,
    AGENT_CHECKS_ROOT: dir,
    AGENT_CHECKS_SCRIPT: path.join(dir, 'missing.mjs'),
  }
  const first = spawnSync('sh', [hook], { env, encoding: 'utf8' })
  assert.equal(first.status, 2)
  assert.match(first.stderr, /hook script missing/)
  assert.match(first.stderr, /Do not rebase/)
  const second = spawnSync('sh', [hook], { env, encoding: 'utf8' })
  assert.equal(second.status, 0)
  assert.equal(second.stderr, '')
})

test('greptile-reviewer copies match the canonical prompt', () => {
  const canonicalPath = path.join(root, '.agents/agents/greptile-reviewer.md')
  const canonical = readFileSync(canonicalPath, 'utf8')
  const body = canonical.replace(/^---\n[\s\S]*?\n---\n/, '').trim()
  for (const relative of ['.claude/agents/greptile-reviewer.md', '.pi/agents/greptile-reviewer.md']) {
    assert.equal(readFileSync(path.join(root, relative), 'utf8'), canonical, relative)
  }
  const toml = readFileSync(path.join(root, '.codex/agents/greptile-reviewer.toml'), 'utf8')
  const instructions = toml.match(/developer_instructions = """\n([\s\S]*?)\n"""/)
  assert.ok(instructions)
  assert.equal(instructions[1].trim(), body)
  assert.match(toml, /name = "greptile-reviewer"/)
})

test('command bans look at the executable, not quoted text', () => {
  assert.equal(guardCommand("rg 'npx tsc' .").decision, 'allow')
  assert.equal(guardCommand('npx tsc --noEmit').decision, 'block')
  assert.equal(guardCommand('pnpm run test').decision, 'block')
  assert.equal(guardCommand('pnpm exec vitest run --maxWorkers 4').decision, 'block')
  assert.equal(
    guardCommand('pnpm exec vitest run --maxWorkers=4 src/a.test.ts').decision,
    'allow',
  )
})

test('comment suppressions are reported and duplicate hunks collapse', () => {
  const line = [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -0,0 +1 @@',
    '+// @ts-expect-error third-party type',
    '',
  ].join('\n')
  const once = reviewDiff(line)
  assert.ok(once.findings.some((finding) => finding.rule === 'no-suppression'))
  const twice = reviewDiff(`${line}${line}`)
  assert.equal(twice.findings.filter((finding) => finding.rule === 'no-suppression').length, 1)
})

test('spec files run and deleted tests do not', () => {
  const spec = (file) => file === 'apps/manager/src/price.spec.ts'
  assert.deepEqual(
    vitestTargets('apps/manager', ['apps/manager/src/price.ts'], spec),
    ['src/price.spec.ts'],
  )
  const live = (file) => file === 'apps/manager/src/price.test.ts'
  assert.deepEqual(
    vitestTargets('apps/manager', ['apps/manager/src/gone.test.ts', 'apps/manager/src/price.test.ts'], live),
    ['src/price.test.ts'],
  )
})

test('repository checks use the git root and the diff contents', () => {
  const source = readFileSync(path.join(root, 'scripts/agent-checks/run.mjs'), 'utf8')
  assert.match(source, /inRepo\(pkg\)/)
  assert.match(source, /cwd: REPO_ROOT/)
  assert.equal(source.includes('--numstat'), false)
  assert.equal(source.includes("git(['diff', '--cached'])"), false)
  assert.notEqual(
    verificationKey(['sha', 'diff\n+const days = 30\n']),
    verificationKey(['sha', 'diff\n+const days = 60\n']),
  )
})

test('pi does not latch the stop check', () => {
  const source = readFileSync(path.join(root, '.pi/extensions/agent-checks.ts'), 'utf8')
  assert.equal(source.includes('continued'), false)
})

test('skill files are linked where each agent looks', () => {
  for (const name of ['writing-tests', 'pr-workflow', 'debug-hca-intent', 'add-signer']) {
    for (const folder of ['.agents/skills', '.claude/skills', '.pi/skills', '.opencode/skills']) {
      const file = path.join(root, folder, name, 'SKILL.md')
      assert.equal(existsSync(file), true, file)
      assert.match(readFileSync(file, 'utf8'), new RegExp(`^---\\nname: ${name}\\n`, 'm'))
    }
  }
  assert.equal(existsSync(path.join(root, '.claude/agents/greptile-reviewer.md')), true)
})
