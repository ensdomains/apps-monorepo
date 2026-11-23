import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { requiresIndependentGraceMigration } from '../migration-policy.js'
import { retentionAssertions } from '../retention-oracle.js'
import type { Configuration } from '../seed.js'

const configurations: Configuration[] = JSON.parse(
  readFileSync(new URL('../configurations.json', import.meta.url), 'utf8'),
)
test('independent grace migration applies to all 14 active emancipated configurations', () => {
  const affected = configurations.filter(requiresIndependentGraceMigration)
  expect(affected).toHaveLength(14)
  expect(new Set(affected.map((c) => c.level))).toEqual(new Set(['3LD', '4LD']))
  for (const c of affected) {
    expect(
      requiresIndependentGraceMigration({ ...c, name_expiry: 'Expired' }),
    ).toBe(false)
    expect(
      requiresIndependentGraceMigration({ ...c, parent_migrated: 'No' }),
    ).toBe(false)
    expect(
      requiresIndependentGraceMigration({ ...c, root_lifecycle_version: 'V1' }),
    ).toBe(false)
    const checks = retentionAssertions(c, {
      migrationOutcome: 'blocked in UI; no wallet submission',
      afterState: null,
    })
    expect(
      checks.find((x) => x.check.startsWith('MIGRATION-GRACE-01'))?.result,
    ).toBe('FAIL')
    expect(
      retentionAssertions(c, {}).find((x) =>
        x.check.startsWith('MIGRATION-GRACE-01'),
      )?.result,
    ).toBe('NOT RUN')
    expect(
      retentionAssertions(c, {
        afterState: { status: 2 },
        migrationOutcome: 'success',
      }).find((x) => x.check.startsWith('MIGRATION-GRACE-01'))?.result,
    ).toBe('PASS')
  }
})

test('identical resolution failures cannot conceal changed source records after refusal', () => {
  const c = configurations.find(requiresIndependentGraceMigration)!
  const source = [
    {
      what: 'text description',
      want: 'retained',
      got: 'retained',
      raw: '0x1234',
    },
  ]
  const baseline = {
    migrationOutcome: 'blocked in UI; no wallet submission',
    beforeRecords: [{ what: 'text description', got: 'ancestor in grace' }],
    afterRecords: [{ what: 'text description', got: 'ancestor in grace' }],
    beforeSourceRecords: source,
    afterSourceRecords: source,
  }
  const sourceCheck = (overrides: Record<string, unknown> = {}) =>
    retentionAssertions(c, { ...baseline, ...overrides }).find(
      (x) => x.check === 'Refusal preserves original stored record bytes',
    )
  expect(sourceCheck()?.result).toBe('PASS')
  expect(
    sourceCheck({
      afterSourceRecords: [{ ...source[0], got: 'lost', raw: '0xabcd' }],
    })?.result,
  ).toBe('FAIL')
  expect(sourceCheck({ afterSourceRecords: [] })?.result).toBe('FAIL')
  expect(sourceCheck({ afterSourceRecords: undefined })?.result).toBe('NOT RUN')
  expect(sourceCheck({ beforeSourceRecords: undefined })?.result).toBe(
    'NOT RUN',
  )
  const readFailure = [
    {
      what: 'text description',
      want: 'retained',
      got: 'read failed: unavailable',
    },
  ]
  expect(
    sourceCheck({
      beforeSourceRecords: readFailure,
      afterSourceRecords: readFailure,
    })?.result,
  ).toBe('BLOCKED')
  expect(sourceCheck({ afterSourceRecords: readFailure })?.result).toBe(
    'BLOCKED',
  )
  expect(
    sourceCheck({ beforeSourceRecords: [], afterSourceRecords: [] })?.result,
  ).toBe('BLOCKED')
  expect(
    sourceCheck({
      beforeRecords: [
        ...baseline.beforeRecords,
        { what: 'ABI 1', got: 'ancestor in grace' },
      ],
    })?.result,
  ).toBe('BLOCKED')
  const badSeed = [{ ...source[0], got: 'never seeded' }]
  const checks = retentionAssertions(c, {
    ...baseline,
    beforeSourceRecords: badSeed,
    afterSourceRecords: badSeed,
  })
  expect(
    checks.find(
      (x) =>
        x.check ===
        'Original stored records match seeded values before refusal',
    )?.result,
  ).toBe('FAIL')
  expect(
    checks.find(
      (x) => x.check === 'Refusal preserves original stored record bytes',
    )?.result,
  ).toBe('BLOCKED')
})

test('a correct subject cannot hide lost ancestor records or a missing tree member', () => {
  const c = { ...configurations[0]!, actors: [] }
  const records = [
    { what: 'text description', want: 'retained', got: 'retained' },
  ]
  const beforeTreeRecords = [
    { name: 'parent.eth', records },
    { name: 'child.parent.eth', records },
  ]
  const evidence = {
    names: ['parent.eth', 'child.parent.eth'],
    beforeTreeRecords,
    afterTreeRecords: beforeTreeRecords,
    afterState: { status: 2 },
  }
  const checks = (overrides: Record<string, unknown> = {}) =>
    retentionAssertions(c, { ...evidence, ...overrides })
  const parent = (overrides: Record<string, unknown> = {}) =>
    checks(overrides).find(
      (x) =>
        x.check === 'Resolution unchanged across migration attempt: parent.eth',
    )
  expect(parent()?.result).toBe('PASS')
  expect(
    parent({
      afterTreeRecords: [
        { name: 'parent.eth', records: [{ ...records[0], got: '' }] },
        beforeTreeRecords[1],
      ],
    })?.result,
  ).toBe('FAIL')
  expect(
    parent({
      afterTreeRecords: [
        { name: 'parent.eth', records: [] },
        beforeTreeRecords[1],
      ],
    })?.result,
  ).toBe('FAIL')
  expect(parent({ afterTreeRecords: [beforeTreeRecords[1]] })?.result).toBe(
    'FAIL',
  )
  expect(
    checks({ afterTreeRecords: [beforeTreeRecords[1]] }).find(
      (x) => x.check === 'All seeded names have an after-resolution snapshot',
    )?.result,
  ).toBe('FAIL')
  expect(parent({ afterTreeRecords: undefined })?.result).toBe('NOT RUN')
})
