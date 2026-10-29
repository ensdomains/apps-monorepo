import { describe, expect, it } from 'vitest'
import {
  makeClassified,
  makeDomain,
} from '@/features/migration/service/_fixtures'
import type { IneligibleName } from '@/features/migration/service/classifyNames'
import { getMigrationEligibleKeys } from './dashboardMigrationEligibility'

const parent = makeClassified({ id: '0xAA', name: 'parent.eth' })
const subname = makeClassified({
  action: 'copy',
  id: '0xBB',
  name: 'sub.parent.eth',
})
const graceName: IneligibleName = {
  domain: makeDomain({ id: '0xCC', name: 'grace.eth' }),
  reason: 'expired-registration',
}

describe('getMigrationEligibleKeys', () => {
  it.each([
    {
      case: 'counts a subname recreated with its parent',
      verifiedSubnames: [subname],
      gracePeriodNames: [],
      expected: ['0xaa', '0xbb'],
    },
    {
      case: 'leaves out a subname blocked from moving with its parent',
      verifiedSubnames: [],
      gracePeriodNames: [],
      expected: ['0xaa'],
    },
    {
      case: 'counts a name in grace, renewed before it is upgraded',
      verifiedSubnames: [],
      gracePeriodNames: [graceName],
      expected: ['0xaa', '0xcc'],
    },
  ])('$case', ({ verifiedSubnames, gracePeriodNames, expected }) => {
    expect(
      getMigrationEligibleKeys({
        classified: [parent, subname],
        gracePeriodNames,
        eligibility: {
          eligible: [parent],
          needsWrapperSync: [],
          verifiedSubnames,
        },
      }),
    ).toEqual(new Set(expected))
  })
})
