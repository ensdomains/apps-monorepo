import { describe, expect, it } from 'vitest'
import { getRegistryRepairCase } from './registryRepairCase'

const ME = '0x86013382F943C6214E1433d1e64936F4000925CB'
const OTHER = '0x0822d199699f0a9D378617817a1439663234a126'

describe('getRegistryRepairCase', () => {
  const run = (
    overrides: Partial<Parameters<typeof getRegistryRepairCase>[0]>,
  ) =>
    getRegistryRepairCase({
      isPendingUpgrade: true,
      account: ME,
      canRepair: true,
      subnameOwners: [ME, ME],
      ...overrides,
    })

  it.each([
    ['an unaffected registry', { isPendingUpgrade: false }, 'unaffected'],
    ['an unchecked registry', { isPendingUpgrade: undefined }, 'unknown'],
    ['no connected wallet', { account: undefined }, 'viewer'],
    ['unknown repair rights', { canRepair: undefined }, 'unknown'],
    ['unknown owners', { subnameOwners: undefined }, 'unknown'],
    ['a repairer owning every subname', {}, 'owns-all'],
    ['a repairer of an empty registry', { subnameOwners: [] }, 'owns-all'],
    ['a repairer sharing subnames', { subnameOwners: [ME, OTHER] }, 'shared'],
    [
      'a subname owner who cannot repair',
      { canRepair: false, subnameOwners: [OTHER, ME] },
      'subname-owner',
    ],
    [
      'an account with no part in it',
      { canRepair: false, subnameOwners: [OTHER] },
      'viewer',
    ],
  ] as const)('with %s: %s', (_case, overrides, expected) => {
    expect(run(overrides)).toBe(expected)
  })

  it('compares owners regardless of address case', () => {
    expect(run({ subnameOwners: [ME.toLowerCase() as typeof ME] })).toBe(
      'owns-all',
    )
  })
})
