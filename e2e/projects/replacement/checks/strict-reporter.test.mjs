import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
mkdirSync(resolve(cwd, 'test-results'), { recursive: true })
const dir = mkdtempSync(resolve(cwd, 'test-results/strict-probe-'))
writeFileSync(
  resolve(dir, 'probe.spec.ts'),
  `import {test,expect} from '@playwright/test';
test('assertion success',()=>expect(1).toBe(1));
test('actual failure',()=>expect(1).toBe(2));
test('expected failure',()=>{test.fail();expect(1).toBe(2)});
test('runtime skip',()=>test.skip(true,'probe'));
import {assertRecordPreservation} from ${JSON.stringify(resolve(cwd, 'helpers/record-preservation-assertions.ts'))};
const record = {what:'text description',want:'original',got:'original'};
const preserved = {name:'fixture.eth',result:'PASS',v2Status:2,before:[record],after:[record]};
test('preservation positive',()=>assertRecordPreservation([preserved]));
test('unmigrated target',()=>assertRecordPreservation([{...preserved,v2Status:1}]));
test('lost record',()=>assertRecordPreservation([{...preserved,after:[{...record,got:'missing'}]}]));
test('empty reads',()=>assertRecordPreservation([{...preserved,after:[]}]));
test('missing target inventory',()=>assertRecordPreservation([]));`,
)
writeFileSync(
  resolve(dir, 'config.ts'),
  `export default {testDir:${JSON.stringify(dir)},outputDir:${JSON.stringify(resolve(dir, 'artifacts'))},reporter:[[${JSON.stringify(resolve(cwd, 'projects/replacement/strict-reporter.ts'))}]],workers:1,retries:0}`,
)
for (const [title, status] of [
  ['assertion success', 0],
  ['actual failure', 1],
  ['expected failure', 1],
  ['runtime skip', 1],
  ['preservation positive', 0],
  ['unmigrated target', 1],
  ['lost record', 1],
  ['empty reads', 1],
  ['missing target inventory', 1],
])
  test(title, () => {
    const childEnv = {
      ...process.env,
      REPLACEMENT_RESULTS: resolve(dir, title),
    }
    delete childEnv.NODE_TEST_CONTEXT
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        '-c',
        resolve(dir, 'config.ts'),
        '--grep',
        title,
      ],
      { cwd, env: childEnv, encoding: 'utf8' },
    )
    assert.equal(result.status, status, result.stdout + result.stderr)
    const outcomes = JSON.parse(
      readFileSync(resolve(dir, title, 'strict-results.json'), 'utf8'),
    )
    assert.equal(
      outcomes.length,
      1,
      'The probe must actually execute/collect the selected test',
    )
    assert.equal(
      outcomes[0].status,
      status === 0 ? 'passed' : title === 'runtime skip' ? 'skipped' : 'failed',
    )
  })
