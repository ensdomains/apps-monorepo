import type { V1Domain } from '@ens-apps/migration'
import { renderHook } from '@testing-library/react'
import { namehash } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useMigrationEligibility: vi.fn(),
  useMigrationRecoverySnapshot: vi.fn(),
  useSmartAccountContext: vi.fn(),
  useV1Names: vi.fn(),
  useConnection: vi.fn(),
}))

vi.mock('./useMigrationEligibility', () => ({
  useMigrationEligibility: mocks.useMigrationEligibility,
}))
vi.mock('./useMigrationRecoverySnapshot', () => ({
  useMigrationRecoverySnapshot: mocks.useMigrationRecoverySnapshot,
}))
vi.mock('./useV1Names', () => ({ useV1Names: mocks.useV1Names }))
vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: mocks.useSmartAccountContext,
}))
vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConnection: mocks.useConnection,
}))

import { type DomainOverrides, makeDomain, OWNER } from '../service/_fixtures'
import type { ClassifiedName } from '../service/classifyNames'
import { FUSES } from '../service/classifyNames'
import { useEligibleV1Names } from './useEligibleV1Names'

type EligibilityBucket =
  | 'frozen'
  | 'alreadyMigrated'
  | 'notPremigrated'
  | 'failed'

const domainFor = (name: string, overrides: DomainOverrides = {}): V1Domain =>
  makeDomain({
    id: namehash(name),
    name,
    labelName: name.split('.')[0],
    ...overrides,
  })

const eligibilityWith =
  (bucket: EligibilityBucket | null) => (names: readonly ClassifiedName[]) => ({
    data: bucket
      ? {
          eligible: [],
          frozen: [],
          alreadyMigrated: [],
          notPremigrated: [],
          failed: [],
          [bucket]: names,
        }
      : undefined,
    isPending: false,
  })

const reasonsByName = (
  result: ReturnType<typeof useEligibleV1Names>,
): ReadonlyMap<string, string> =>
  new Map(
    [...result.gracePeriodNames, ...result.unavailableNames].map(
      ({ domain, reason }) => [domain.name, reason],
    ),
  )

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useSmartAccountContext.mockReturnValue({ ownerAddress: OWNER })
  mocks.useConnection.mockReturnValue({ address: OWNER })
  mocks.useMigrationRecoverySnapshot.mockReturnValue(null)
})

describe('useEligibleV1Names known bugs (WEB-1942)', () => {
  // Only grace and three unavailable reasons are surfaced; every other ineligible reason and every failed live check drops the name from all lists. Remove .fails when fixed.
  it.fails.each<[string, V1Domain, EligibilityBucket | null]>([
    ['live bucket frozen', domainFor('alice.eth'), 'frozen'],
    ['live bucket alreadyMigrated', domainFor('alice.eth'), 'alreadyMigrated'],
    ['live bucket notPremigrated', domainFor('alice.eth'), 'notPremigrated'],
    ['live bucket failed', domainFor('alice.eth'), 'failed'],
    [
      'not-transferable',
      domainFor('locked.eth', {
        isWrapped: true,
        fuses:
          FUSES.CANNOT_UNWRAP |
          FUSES.CANNOT_TRANSFER |
          FUSES.PARENT_CANNOT_CONTROL |
          FUSES.IS_DOT_ETH,
      }),
      null,
    ],
    [
      'unsupported-resolver',
      domainFor('sub.alice.eth', {
        parentName: 'alice.eth',
        registrantId: null,
      }),
      null,
    ],
    ['unknown-label', domainFor('alice.eth', { labelName: null }), null],
    ['invalid-label', domainFor('alice.eth', { labelName: 'bad.label' }), null],
    [
      'missing-parent',
      domainFor('sub.bob.eth', {
        parentName: 'bob.eth',
        registrantId: null,
        resolverAddress: null,
      }),
      null,
    ],
    [
      'expired-registration past grace',
      domainFor('alice.eth', { registrationExpiry: '100' }),
      null,
    ],
  ])(
    'WEB-1942 #4: accounts for a name with a reason (%s)',
    (_, domain, bucket) => {
      mocks.useV1Names.mockReturnValue({ data: [domain], isPending: false })
      mocks.useMigrationEligibility.mockImplementation(eligibilityWith(bucket))

      const { result } = renderHook(() => useEligibleV1Names())

      expect(result.current.eligible).toEqual([])
      expect(reasonsByName(result.current).get(domain.name)).toEqual(
        expect.any(String),
      )
    },
  )
})
