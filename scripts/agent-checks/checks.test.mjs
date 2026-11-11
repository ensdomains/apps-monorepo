import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  guardCommand,
  packagesFor,
  reviewBranch,
  reviewDiff,
  reviewPrBody,
  vitestTargets,
} from './lib.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

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
    'pnpm typecheck',
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
  assert.deepEqual(rules, ['R13', 'R14'])
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
  assert.ok(rules.includes('R19'))
  assert.ok(rules.includes('R20'))
  assert.ok(rules.includes('R21'))
  assert.ok(rules.includes('R17'))
  assert.ok(rules.includes('T08'))
  assert.ok(rules.includes('R38'))
  assert.ok(rules.includes('R39'))
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

test('pr body blocks only when a body exists and a section is missing', () => {
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
  const body = '## Regression check\nnone\n## Behaviour changes\nprice.test.ts: expected price changed\n'
  assert.equal(reviewPrBody(body, diff).decision, 'allow')
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
  assert.equal(JSON.parse(blocked.stdout).decision, 'block')
  const reported = spawnSync(
    process.execPath,
    [runner, 'guard-command', '--command', 'npx tsc', '--report-only'],
    { encoding: 'utf8' },
  )
  assert.equal(reported.status, 0)
  assert.equal(JSON.parse(reported.stdout).decision, 'block')
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
