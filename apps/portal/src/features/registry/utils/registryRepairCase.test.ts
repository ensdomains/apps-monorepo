import { describe, expect, it } from 'vitest'
import {
  carriedSubnamesText,
  getRegistryRepairCase,
  shouldShowSubnameOwnerNotice,
  shouldShowUpgradeCard,
} from './registryRepairCase'

describe('getRegistryRepairCase', () => {
  const run = (
    overrides: Partial<Parameters<typeof getRegistryRepairCase>[0]>,
  ) =>
    getRegistryRepairCase({
      isPendingUpgrade: true,
      isConnected: true,
      canSwitchParent: true,
      occupants: { count: 3, thirdPartyCount: 0 },
      ...overrides,
    })

  it.each([
    ['an unaffected registry', { isPendingUpgrade: false }, 'unaffected'],
    ['an unchecked registry', { isPendingUpgrade: undefined }, 'unknown'],
    ['no connected wallet', { isConnected: false }, 'viewer'],
    [
      "an account that can't switch the name",
      { canSwitchParent: false },
      'viewer',
    ],
    ['unknown switch rights', { canSwitchParent: undefined }, 'unknown'],
    ['owning every subname (Case A)', {}, 'owns-all'],
    [
      'someone else owning a subname (Case B)',
      { occupants: { count: 3, thirdPartyCount: 1 } },
      'shared',
    ],
    ['unread ownership', { occupants: undefined }, 'unknown'],
    ['ownership bigname cannot count', { occupants: null }, 'unknown'],
  ] as const)('with %s: %s', (_case, overrides, expected) => {
    expect(run(overrides)).toBe(expected)
  })
})

describe('shouldShowUpgradeCard', () => {
  it.each([
    ['a Case A account', 'owns-all', false, true],
    ['a brief unknown while shown', 'unknown', true, true],
    ['an unknown never shown', 'unknown', false, false],
    ['an upgraded registry', 'unaffected', true, false],
    ['an account that lost the roles', 'viewer', true, false],
    ['a Case B account, not offered yet', 'shared', true, false],
  ] as const)('for %s: %s', (_case, repairCase, wasShown, expected) => {
    expect(shouldShowUpgradeCard({ repairCase, wasShown })).toBe(expected)
  })
})

describe('shouldShowSubnameOwnerNotice', () => {
  const run = (
    overrides: Partial<Parameters<typeof shouldShowSubnameOwnerNotice>[0]>,
  ) =>
    shouldShowSubnameOwnerNotice({
      isV2: true,
      isOwner: true,
      isSubname: true,
      isPendingUpgrade: true,
      canUpgradeRegistry: false,
      ...overrides,
    })

  it('shows for the owner of a subname in an outdated registry they cannot upgrade', () => {
    expect(run({})).toBe(true)
  })

  it.each([
    ['an ENSv1 name', { isV2: false }],
    ['a visitor who does not own the subname', { isOwner: false }],
    ['a 2LD', { isSubname: false }],
    ['a current registry', { isPendingUpgrade: false }],
    ['an unchecked registry', { isPendingUpgrade: undefined }],
    ['the account that can upgrade the registry', { canUpgradeRegistry: true }],
    ['an unread upgrade role', { canUpgradeRegistry: undefined }],
  ] as const)('hides for %s', (_case, overrides) => {
    expect(run(overrides)).toBe(false)
  })
})

describe('carriedSubnamesText', () => {
  it.each([
    [12, 'Your 12 subnames and their settings'],
    [1, 'Your 1 subname and its settings'],
    [undefined, 'Your subnames and their settings'],
  ] as const)('for %s', (count, expected) => {
    expect(carriedSubnamesText(count)).toBe(expected)
  })
})
