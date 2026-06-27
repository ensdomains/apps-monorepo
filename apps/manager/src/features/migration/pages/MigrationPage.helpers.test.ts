import { describe, expect, it } from 'vitest'
import {
  getAutoMigrationStartKeyAfterRenewal,
  isMigrationQueryKey,
  isPostMigrationRefreshQueryKey,
} from './MigrationPage.helpers'

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

describe('isPostMigrationRefreshQueryKey', () => {
  it.each([
    ['migration key', [{ $scope: 'migration' }, { x: 1 }], true],
    ['dashboard key', [{ $scope: 'dashboard' }, { x: 1 }], true],
    ['profile key', [{ $scope: 'profile' }, { x: 1 }], true],
    ['unrelated key', [{ $scope: 'renew' }, { x: 1 }], false],
  ] as const)('%s → %s', (_, key, expected) => {
    expect(isPostMigrationRefreshQueryKey([...key])).toBe(expected)
  })
})

describe('getAutoMigrationStartKeyAfterRenewal', () => {
  const readyParams = {
    step: 'select',
    selectedNames: ['solaro.eth'],
    renewedGraceNames: ['solaro.eth'],
    selectedRenewableGraceCount: 0,
    gasEstimateStatus: 'ready',
    gasFundingStatus: 'settled',
    canSubmitMigration: true,
  } as const

  it('returns a stable key when renewal has finished and migration is ready', () => {
    expect(getAutoMigrationStartKeyAfterRenewal(readyParams)).toBe(
      'selected=solaro.eth|renewed=solaro.eth',
    )
  })

  it.each([
    ['still in renewal game', { step: 'renewGrace' }],
    ['no completed renewals', { renewedGraceNames: [] }],
    ['no selected names', { selectedNames: [] }],
    [
      'selection still includes grace names',
      { selectedRenewableGraceCount: 1 },
    ],
    ['migration gas estimate is loading', { gasEstimateStatus: 'loading' }],
    ['wallet funding is pending', { gasFundingStatus: 'funding' }],
    ['wallet cannot submit', { canSubmitMigration: false }],
  ] as const)('does not auto-start when %s', (_, overrides) => {
    expect(
      getAutoMigrationStartKeyAfterRenewal({
        ...readyParams,
        ...overrides,
      }),
    ).toBeUndefined()
  })

  it('normalizes selected and renewed names for duplicate-start detection', () => {
    expect(
      getAutoMigrationStartKeyAfterRenewal({
        ...readyParams,
        selectedNames: ['z.eth', 'A.eth'],
        renewedGraceNames: ['SOLARO.eth', 'beta.eth'],
      }),
    ).toBe('selected=a.eth,z.eth|renewed=beta.eth,solaro.eth')
  })
})
