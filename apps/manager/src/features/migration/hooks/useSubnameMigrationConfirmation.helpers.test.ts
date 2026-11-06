import { describe, expect, it } from 'vitest'
import { canSkipSubnameDialog } from './useSubnameMigrationConfirmation.helpers'

const run = (
  overrides: Partial<Parameters<typeof canSkipSubnameDialog>[0]> = {},
) =>
  canSkipSubnameDialog({
    action: 'start',
    isReady: true,
    affectedCount: 0,
    unrecoverableCount: 0,
    hasIncludedSubnames: false,
    ...overrides,
  })

describe('canSkipSubnameDialog', () => {
  it('starts straight away when nothing is lost and no subnames are included', () => {
    expect(run()).toBe(true)
  })

  it.each([
    ['subnames are included in a fresh start', { hasIncludedSubnames: true }],
    ['the check is not ready', { isReady: false }],
    ['the check is unknown', { affectedCount: undefined }],
    ['subnames would be lost', { affectedCount: 1 }],
    [
      'subnames would be lost on a retry',
      { action: 'retry' as const, affectedCount: 1 },
    ],
    [
      'unknown-label subnames would be dropped, even on a retry',
      { action: 'retry' as const, unrecoverableCount: 1 },
    ],
  ])('opens the dialog when %s', (_, overrides) => {
    expect(run(overrides)).toBe(false)
  })

  it('does not explain included subnames again on a retry', () => {
    expect(run({ action: 'retry', hasIncludedSubnames: true })).toBe(true)
  })
})
