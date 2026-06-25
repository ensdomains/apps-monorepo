import { describe, expect, it } from 'vitest'
import {
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
