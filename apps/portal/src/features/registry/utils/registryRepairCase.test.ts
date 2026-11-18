import { describe, expect, it } from 'vitest'
import {
  getRegistryRepairCase,
  isUpgradeCardForPage,
  sharedRegistryText,
  shouldShowSubnameOwnerNotice,
  shouldShowUpgradeCard,
  upgradeCardText,
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
    expect(
      shouldShowUpgradeCard({ repairCase, wasShown, isCaseBOffered: false }),
    ).toBe(expected)
  })

  it('offers the card to a Case B account once Case B is offered', () => {
    expect(
      shouldShowUpgradeCard({
        repairCase: 'shared',
        wasShown: false,
        isCaseBOffered: true,
      }),
    ).toBe(true)
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

describe('isUpgradeCardForPage', () => {
  const PAGE = '0x00000000000000000000000000000000000000a1'
  const OTHER = '0x00000000000000000000000000000000000000b1'

  it.each([
    ['a page not about one registry', undefined, OTHER, true],
    ['the name still on this registry', PAGE, PAGE, true],
    ['the name now on another registry', PAGE, OTHER, false],
    ["the name's registry not read yet", PAGE, undefined, false],
  ] as const)('for %s: %s', (_case, pageRegistry, nameRegistry, expected) => {
    expect(isUpgradeCardForPage({ pageRegistry, nameRegistry })).toBe(expected)
  })
})

describe('sharedRegistryText', () => {
  const run = (
    referencedBy: readonly { readonly name: string | null }[],
    hasMore = false,
  ) => sharedRegistryText({ name: 'a.eth', referencedBy, hasMore })

  it('says nothing when only this name uses the registry', () => {
    expect(run([{ name: 'A.eth' }])).toBeNull()
  })

  it('names the one other name and what happens to it', () => {
    expect(run([{ name: 'a.eth' }, { name: 'b.eth' }])).toBe(
      "This registry is also used by b.eth. Upgrading only moves a.eth: b.eth keeps the old registry until its owner upgrades it or points it at a.eth's new registry.",
    )
  })

  it.each([
    [
      'several names',
      [{ name: 'b.eth' }, { name: 'c.eth' }],
      false,
      'b.eth, c.eth.',
    ],
    [
      'more than it lists',
      [
        { name: 'b.eth' },
        { name: 'c.eth' },
        { name: 'd.eth' },
        { name: 'e.eth' },
      ],
      false,
      'b.eth, c.eth, d.eth and others.',
    ],
    ['a further page', [{ name: 'b.eth' }], true, 'b.eth and others.'],
    ['only unnamed references', [{ name: null }], false, 'other names.'],
  ] as const)('for %s', (_case, referencedBy, hasMore, subject) => {
    expect(run(referencedBy, hasMore)).toBe(
      `This registry is also used by ${subject} Upgrading only moves a.eth: those names keep the old registry until their owners upgrade them or point them at a.eth's new registry.`,
    )
  })
})

describe('upgradeCardText', () => {
  const OPENING =
    'This registry runs on an older version that has since been fixed.'
  const CLOSING =
    'will carry over. Inform other users of the registry to use the newly upgraded registry going forward.'

  it.each([
    [12, 0, 'Your 12 subnames and their settings'],
    [1, 0, 'Your 1 subname and its settings'],
    [undefined, undefined, 'Your subnames and their settings'],
  ] as const)(
    'keeps the Case A wording for %s subnames',
    (count, othersCount, carried) => {
      expect(upgradeCardText({ count, othersCount })).toBe(
        `${OPENING} Upgrade it to create subnames or change roles. ${carried} ${CLOSING}`,
      )
    },
  )

  it.each([
    [12, 3, 'All 12 subnames, including 3 owned by others, and their settings'],
    [1, 1, 'Its 1 subname, owned by someone else, and its settings'],
  ] as const)(
    'tells a Case B account what carries over without promising it roles, for %s subnames',
    (count, othersCount, carried) => {
      expect(upgradeCardText({ count, othersCount })).toBe(
        `${OPENING} Upgrade it so subnames can be created and roles changed again. ${carried} ${CLOSING}`,
      )
    },
  )
})
