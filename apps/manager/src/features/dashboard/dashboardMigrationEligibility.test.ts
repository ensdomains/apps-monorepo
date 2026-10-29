import { sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import {
  makeClassified,
  makeDomain,
  OWNER,
} from '@/features/migration/service/_fixtures'
import { classifyNames } from '@/features/migration/service/classifyNames'
import {
  classifyRenewedGraceNames,
  getMigrationEligibleKeys,
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
