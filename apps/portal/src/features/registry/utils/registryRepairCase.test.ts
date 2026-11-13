import { describe, expect, it } from 'vitest'
import { getRegistryRepairCase } from './registryRepairCase'

describe('getRegistryRepairCase', () => {
  const run = (
    overrides: Partial<Parameters<typeof getRegistryRepairCase>[0]>,
  ) =>
    getRegistryRepairCase({
      isPendingUpgrade: true,
      isConnected: true,
      canRepair: true,
      occupants: { count: 2, thirdPartyCount: 0 },
      ...overrides,
    })

  it.each([
    ['an unaffected registry', { isPendingUpgrade: false }, 'unaffected'],
    ['an unchecked registry', { isPendingUpgrade: undefined }, 'unknown'],
    ['no connected wallet', { isConnected: false }, 'viewer'],
    ['an account that cannot repair', { canRepair: false }, 'viewer'],
    ['unknown repair rights', { canRepair: undefined }, 'unknown'],
    ['unread subnames', { occupants: undefined }, 'unknown'],
    ['subnames bigname cannot count', { occupants: null }, 'unknown'],
    ['a repairer owning every subname', {}, 'owns-all'],
    [
      'a repairer of an empty registry',
      { occupants: { count: 0, thirdPartyCount: 0 } },
      'owns-all',
    ],
    [
      'a repairer sharing subnames',
      { occupants: { count: 2, thirdPartyCount: 1 } },
      'shared',
    ],
  ] as const)('with %s: %s', (_case, overrides, expected) => {
    expect(run(overrides)).toBe(expected)
  })
})
