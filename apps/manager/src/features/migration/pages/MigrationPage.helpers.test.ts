import { describe, expect, it } from 'vitest'
import type { V1Domain } from '@/features/migration/service/v1SubgraphClient'
import {
  isMigrationQueryKey,
  selectDomainsFromNames,
} from './MigrationPage.helpers'

const domain = (name: string): V1Domain => ({ name }) as unknown as V1Domain

describe('selectDomainsFromNames', () => {
  it('keeps domains whose name is in the selected set, preserving v1Names order', () => {
    const result = selectDomainsFromNames(
      [domain('a.eth'), domain('b.eth'), domain('c.eth')],
      ['c.eth', 'a.eth'],
    )
    expect(result.map((d) => d.name)).toEqual(['a.eth', 'c.eth'])
  })

  it('returns empty array when no selection matches', () => {
    expect(selectDomainsFromNames([domain('a.eth')], ['missing.eth'])).toEqual(
      [],
    )
  })

  it('returns empty array when inputs are empty', () => {
    expect(selectDomainsFromNames([], [])).toEqual([])
  })
})

describe('isMigrationQueryKey', () => {
  it.each([
    ['legacy preflight key', ['migration-preflight', { x: 1 }], true],
    [
      'qk-scoped migration key',
      [{ $scope: 'migration', kind: 'foo' }, { x: 1 }],
      true,
    ],
    ['qk-scoped non-migration key', [{ $scope: 'dashboard' }, { x: 1 }], false],
    ['unrelated key', ['dashboard-domains'], false],
    ['empty key', [], false],
  ] as const)('%s → %s', (_, key, expected) => {
    expect(isMigrationQueryKey([...key])).toBe(expected)
  })
})
