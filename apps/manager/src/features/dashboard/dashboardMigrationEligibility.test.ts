import { sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import {
  makeClassified,
  makeDomain,
  OTHER,
  OWNER,
} from '@/features/migration/service/_fixtures'
import { classifyNames } from '@/features/migration/service/classifyNames'
import {
  classifyForHolders,
  classifyRenewedGraceNames,
  getMigrationEligibleKeys,
  getMigrationHolders,
  getUpgradeKeys,
  getV1NameStatus,
} from './dashboardMigrationEligibility'

const NOW = BigInt(Math.floor(Date.now() / 1000))
const DAY = 86_400n

const parent = makeClassified({ id: '0xAA', name: 'parent.eth' })
const subname = makeClassified({
  action: 'copy',
  id: '0xBB',
  name: 'sub.parent.eth',
})
const graceName = makeClassified({ id: '0xCC', name: 'grace.eth' })
const graceSubname = makeClassified({
  action: 'copy',
  id: '0xDD',
  name: 'sub.grace.eth',
})

describe('classifyRenewedGraceNames', () => {
  it.each([
    { case: 'a lease in grace', isUnreserved: undefined },
    { case: 'a lease in grace whose reservation lapsed', isUnreserved: true },
  ] as const)(
    'classifies $case as upgradeable once renewed',
    ({ isUnreserved }) => {
      const domain = {
        ...makeDomain({
          id: '0xcc',
          name: 'grace.eth',
          registrationExpiry: String(NOW - 10n * DAY),
        }),
        isUnreserved,
      }
      const { classified, ineligible } = classifyNames(
        [domain],
        OWNER,
        sepolia.id,
      )
      expect(classified).toEqual([])

      const renewed = classifyRenewedGraceNames({
        gracePeriodNames: ineligible,
        ownerAddress: OWNER,
        chainId: sepolia.id,
        nowSeconds: NOW,
      })

      expect(renewed.map(({ action, domain }) => [action, domain.id])).toEqual([
        ['migrate', '0xcc'],
      ])
    },
  )
})

describe('getMigrationEligibleKeys', () => {
  it.each([
    {
      case: 'counts a subname recreated with its parent',
      verifiedSubnames: [subname],
      graceEligibility: undefined,
      expected: ['0xaa', '0xbb'],
    },
    {
      case: 'leaves out a subname blocked from moving with its parent',
      verifiedSubnames: [],
      graceEligibility: undefined,
      expected: ['0xaa'],
    },
    {
      case: 'counts a name in grace whose renewed form passes the check',
      verifiedSubnames: [],
      graceEligibility: { eligible: [graceName], verifiedSubnames: [] },
      expected: ['0xaa', '0xcc'],
    },
    {
      case: 'counts the subnames recreated with a name in grace',
      verifiedSubnames: [],
      graceEligibility: {
        eligible: [graceName],
        verifiedSubnames: [graceSubname],
      },
      expected: ['0xaa', '0xcc', '0xdd'],
    },
    {
      case: 'leaves out a name in grace the check blocks',
      verifiedSubnames: [],
      graceEligibility: { eligible: [], verifiedSubnames: [] },
      expected: ['0xaa'],
    },
  ])('$case', ({ verifiedSubnames, graceEligibility, expected }) => {
    expect(
      getMigrationEligibleKeys({
        classified: [parent, subname],
        eligibility: {
          eligible: [parent],
          needsWrapperSync: [],
          verifiedSubnames,
        },
        graceEligibility,
      }),
    ).toEqual(new Set(expected))
  })
})

describe('getV1NameStatus', () => {
  it.each([
    { isEligible: true, isUpgradeable: true, expected: 'eligibleUpgrade' },
    { isEligible: false, isUpgradeable: true, expected: 'ensv1' },
    { isEligible: false, isUpgradeable: false, expected: 'ensv1Only' },
  ] as const)(
    'eligible $isEligible, upgradeable $isUpgradeable: $expected',
    ({ isEligible, isUpgradeable, expected }) => {
      expect(getV1NameStatus({ isEligible, isUpgradeable })).toBe(expected)
    },
  )
})

describe('getMigrationHolders', () => {
  it('lists each address that could hold a name once, without the zero address', () => {
    const managed = makeDomain({ id: '0x01', ownerId: OTHER })
    const wrapped = makeDomain({
      id: '0x02',
      isWrapped: true,
      wrappedOwnerId: OTHER,
      ownerId: '0x0000000000000000000000000000000000000000',
    })

    expect(getMigrationHolders([managed, wrapped])).toEqual([OWNER, OTHER])
  })
})

describe('classifyForHolders', () => {
  it('puts a name under the registrant who can upgrade it, not the manager', () => {
    const managed = makeDomain({
      id: '0x01',
      name: 'managed.eth',
      ownerId: OTHER,
      registrationExpiry: String(NOW + 365n * DAY),
    })
    const inGrace = makeDomain({
      id: '0x02',
      name: 'grace.eth',
      labelName: 'grace',
      registrationExpiry: String(NOW - 10n * DAY),
    })

    const holders = classifyForHolders({
      domains: [managed, inGrace],
      holders: [OWNER, OTHER],
      chainId: sepolia.id,
      nowSeconds: NOW,
    })

    expect(
      holders.map(({ holder, classified, renewedGraceNames }) => [
        holder,
        classified.map(({ domain }) => domain.id),
        renewedGraceNames.map(({ domain }) => domain.id),
      ]),
    ).toEqual([[OWNER, ['0x01'], ['0x02']]])
  })
})

describe('getUpgradeKeys', () => {
  const owned = makeClassified({ id: '0xAA', name: 'owned.eth' })
  const othersName = makeClassified({ id: '0xBB', name: 'theirs.eth' })
  const holders = [
    { holder: OWNER, classified: [owned], renewedGraceNames: [] },
    { holder: OTHER, classified: [othersName], renewedGraceNames: [] },
  ]
  const checked = (eligible: readonly ReturnType<typeof makeClassified>[]) => ({
    eligible,
    needsWrapperSync: [],
    verifiedSubnames: [],
  })

  it.each([
    {
      case: 'the connected holder upgrades their own name; someone else can upgrade theirs',
      viewer: OWNER,
      expected: { eligible: ['0xaa'], upgradeable: ['0xaa', '0xbb'] },
    },
    {
      case: 'a disconnected viewer can upgrade nothing; each holder still can',
      viewer: undefined,
      expected: { eligible: [], upgradeable: ['0xaa', '0xbb'] },
    },
  ])('$case', ({ viewer, expected }) => {
    const keys = getUpgradeKeys({
      holders,
      eligibilities: [checked([owned]), checked([othersName])],
      graceEligibilities: [undefined, undefined],
      viewer,
    })

    expect(keys.eligibleKeys).toEqual(new Set(expected.eligible))
    expect(keys.upgradeableKeys).toEqual(new Set(expected.upgradeable))
  })

  it('leaves out a name the check blocks for its holder', () => {
    const keys = getUpgradeKeys({
      holders,
      eligibilities: [checked([owned]), checked([])],
      graceEligibilities: [undefined, undefined],
      viewer: OWNER,
    })

    expect(keys.upgradeableKeys).toEqual(new Set(['0xaa']))
  })
})
