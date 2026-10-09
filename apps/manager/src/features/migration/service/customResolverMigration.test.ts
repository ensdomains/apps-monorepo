import { computeResolverAddress } from '@ens-apps/smart-account'
import { ok } from 'neverthrow'
import {
  type Address,
  decodeFunctionData,
  getAddress,
  type Hex,
  namehash,
  type PublicClient,
  zeroAddress,
} from 'viem'
import { sepolia } from 'viem/chains'
import { assert, beforeEach, describe, expect, it, vi } from 'vitest'

import { MIGRATION_HELPER_ABI } from '../contracts/abis'
import { V2_CONTRACTS } from '../contracts/addresses'
import { type DomainOverrides, makeDomain, OWNER } from './_fixtures'
import { buildMigrationPlan } from './buildMigrationPlan'
import { FUSES, type MigrationTokenType } from './classifyNames'
import type { MigrationPreflight } from './computeMigrationPreflight'
import {
  computeExpectedWrapperRegistry,
  type DirectMigrationRoute,
} from './directMigrationRoutes'
import { fetchV1Profiles, type Profile } from './fetchV1Profiles'
import { getV1ProfileKeys } from './v1ProfileKeys'

vi.mock('./v1ProfileKeys', async (importActual) => ({
  ...(await importActual<typeof import('./v1ProfileKeys')>()),
  getV1ProfileKeys: vi.fn(),
}))
vi.mock('./fetchV1Profiles', async (importActual) => ({
  ...(await importActual<typeof import('./fetchV1Profiles')>()),
  fetchV1Profiles: vi.fn(),
}))

const getV1ProfileKeysMock = vi.mocked(getV1ProfileKeys)
const fetchV1ProfilesMock = vi.mocked(fetchV1Profiles)

const HCA: Address = '0x00000000000000000000000000000000000000ca'

/** Not in `KNOWN_PUBLIC_RESOLVERS` — a user's own resolver contract. */
const CUSTOM_RESOLVER: Address = '0x00000000000000000000000000000000000000cc'
/** In `KNOWN_PUBLIC_RESOLVERS`, so it is eligible for record replay. */
const KNOWN_PUBLIC_RESOLVER: Address =
  '0x640294a2b2d87e7f522db3e3e3e876764bce170d'

const NAME = 'alice.eth'
const NODE = namehash(NAME) as Hex
const ADDR_RECORD = '0x0000000000000000000000000000000000000abc' as Hex

/** Records that exist on the name's V1 resolver, whatever that resolver is. */
const V1_PROFILE: Profile = {
  texts: [{ key: 'description', value: 'custom resolver name' }],
  addresses: [{ coinType: 60n, value: ADDR_RECORD }],
  // `Profile` gained these when contenthash/ABI preservation landed; this
  // fixture deliberately has neither, so the resolver-strategy assertions below
  // stay about texts and addresses only.
  contentHash: null,
  abis: [],
}

const publicClient = { chain: { id: sepolia.id } } as PublicClient

const routeFor = (tokenType: MigrationTokenType) =>
  new Map<string, DirectMigrationRoute>([
    [
      NAME,
      {
        name: NAME,
        receiver:
          tokenType === 'locked-2ld'
            ? V2_CONTRACTS.LockedMigrationController
            : V2_CONTRACTS.UnlockedMigrationController,
        parentDependency: null,
        expectedWrapperRegistry:
          tokenType === 'locked-2ld'
            ? computeExpectedWrapperRegistry({ name: NAME })
            : null,
        receiverReadiness: 'migration-controller',
      },
    ],
  ])

const preflightFor = (tokenType: MigrationTokenType): MigrationPreflight => ({
  skipFetchProfilesPhase: false,
  hcaReadiness: { status: 'deployment-required', hca: HCA },
  directMigrationRoutes: routeFor(tokenType),
})

const planFor = async (
  overrides: DomainOverrides,
  tokenType: MigrationTokenType = 'unwrapped',
) =>
  buildMigrationPlan({
    domains: [
      makeDomain({ id: NODE, name: NAME, labelName: 'alice', ...overrides }),
    ],
    hcaAddress: HCA,
    migrationOwner: OWNER,
    publicClient,
    preflight: preflightFor(tokenType),
  })

const wrapped = (extra: DomainOverrides = {}): DomainOverrides => ({
  isWrapped: true,
  wrappedOwnerId: OWNER,
  ...extra,
})

const phasesOf = (plan: Awaited<ReturnType<typeof planFor>>) => {
  const batch = plan.atomicBatches[0]
  assert(batch)
  return batch.innerExecutions.map((execution) => execution.phase)
}

type MigrationData = { readonly label: string; readonly resolver: Address }

/** The resolver the helper is told to write into the V2 registry for `NAME`. */
const migrationResolverOf = (plan: Awaited<ReturnType<typeof planFor>>) => {
  const batch = plan.atomicBatches[0]
  assert(batch)
  const migrate = batch.innerExecutions.find(
    (execution) => execution.phase === 'migrate',
  )
  assert(migrate)
  const decoded = decodeFunctionData({
    abi: MIGRATION_HELPER_ABI,
    data: migrate.call.data,
  })
  assert(decoded.functionName === 'migrate')
  const [unwrapped, unlockedGroups, lockedGroups, lockedChildrenGroups] =
    decoded.args as readonly [
      readonly MigrationData[],
      readonly (readonly MigrationData[])[],
      readonly (readonly MigrationData[])[],
      readonly { readonly groups: readonly (readonly MigrationData[])[] }[],
    ]
  const everyData: readonly MigrationData[] = [
    ...unwrapped,
    ...unlockedGroups.flat(),
    ...lockedGroups.flat(),
    ...lockedChildrenGroups.flatMap((entry) => entry.groups.flat()),
  ]
  const data = everyData.find((entry) => entry.label === 'alice')
  assert(data)
  return getAddress(data.resolver)
}

beforeEach(() => {
  getV1ProfileKeysMock.mockReset()
  getV1ProfileKeysMock.mockReturnValue(
    ok([{ id: NODE, texts: ['description'], coinTypes: ['60'] }]) as never,
  )
  fetchV1ProfilesMock.mockReset()
  fetchV1ProfilesMock.mockResolvedValue(new Map([[NODE, V1_PROFILE]]))
})

describe('migrating a V1 name whose resolver is not a known public resolver', () => {
  it('carries the custom resolver onto V2 and replays no records', async () => {
    const plan = await planFor({ resolverAddress: CUSTOM_RESOLVER })

    expect(plan.classified).toEqual([
      expect.objectContaining({
        tokenType: 'unwrapped',
        resolverStrategy: 'keep-v1',
        v1ResolverAddress: CUSTOM_RESOLVER,
      }),
    ])

    // The V2 registry slot points back at the same V1 resolver contract, so
    // resolution survives only because the node hash is unchanged.
    expect(migrationResolverOf(plan)).toBe(getAddress(CUSTOM_RESOLVER))

    // No owned PermissionedResolver, no record replay, and the records are
    // never even read: `profiles` stays empty despite the name having a
    // description and an ETH address on V1.
    expect(plan.ownedPermRes).toBeNull()
    expect(plan.profiles.size).toBe(0)
    expect(fetchV1ProfilesMock).not.toHaveBeenCalled()
    expect(phasesOf(plan)).toEqual(['migrate'])
  })

  it('records nothing to verify beyond ownership, unlike the replay path', async () => {
    const plan = await planFor({ resolverAddress: CUSTOM_RESOLVER })
    const batch = plan.atomicBatches[0]
    assert(batch)

    const expectationTypes = batch.verificationExpectations.map(
      (expectation) => expectation.type,
    )
    // `name-subregistry` is written for every non-locked name since subname
    // migration landed: an unwrapped 2LD with no copied children must end up
    // with the zero subregistry, which is as much a post-condition as its owner
    // and resolver. It is not a record expectation, so it does not weaken what
    // this test is about — the two `profile-*` assertions below are the oracle
    // for "no records were replayed".
    expect(expectationTypes).toEqual([
      'name-owner',
      'name-resolver',
      'name-subregistry',
    ])
    expect(expectationTypes).not.toContain('profile-text')
    expect(expectationTypes).not.toContain('profile-address')

    const subregistryExpectation = batch.verificationExpectations.find(
      (expectation) => expectation.type === 'name-subregistry',
    )
    assert(subregistryExpectation?.type === 'name-subregistry')
    expect(subregistryExpectation.expectedSubregistry).toBe(zeroAddress)

    const resolverExpectation = batch.verificationExpectations.find(
      (expectation) => expectation.type === 'name-resolver',
    )
    assert(resolverExpectation?.type === 'name-resolver')
    expect(resolverExpectation.expectedResolver).toBe(
      getAddress(CUSTOM_RESOLVER),
    )
  })

  it('replays the same records when the resolver is a known public resolver', async () => {
    const plan = await planFor({ resolverAddress: KNOWN_PUBLIC_RESOLVER })
    const ownedPermRes = computeResolverAddress({
      chainId: sepolia.id,
      hca: HCA,
    })

    expect(plan.classified).toEqual([
      expect.objectContaining({ resolverStrategy: 'to-owned-permres' }),
    ])
    expect(plan.ownedPermRes).toBe(ownedPermRes)
    expect(migrationResolverOf(plan)).toBe(getAddress(ownedPermRes))
    expect(fetchV1ProfilesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        names: [
          { name: NAME, nodeHex: NODE, v1ResolverAddress: KNOWN_PUBLIC_RESOLVER },
        ],
      }),
    )
    expect(phasesOf(plan)).toEqual([
      'resolver-deployment',
      'wallet-co-admin-grant',
      'migrate',
      'profile-replay',
    ])

    const batch = plan.atomicBatches[0]
    assert(batch)
    expect(
      batch.verificationExpectations.map((expectation) => expectation.type),
    ).toEqual(expect.arrayContaining(['profile-text', 'profile-address']))
  })

  it.each([
    ['unlocked', wrapped({ fuses: 0n }), 'unlocked'],
    ['locked-2ld', wrapped({ fuses: FUSES.CANNOT_UNWRAP }), 'locked-2ld'],
    [
      'locked-2ld with CANNOT_SET_RESOLVER',
      wrapped({ fuses: FUSES.CANNOT_UNWRAP | FUSES.CANNOT_SET_RESOLVER }),
      'locked-2ld',
    ],
  ] as const)('keeps the custom resolver and skips replay for %s too', async (_label, overrides, tokenType) => {
    const plan = await planFor(
      { ...overrides, resolverAddress: CUSTOM_RESOLVER },
      tokenType,
    )

    expect(plan.classified).toEqual([
      expect.objectContaining({ tokenType, resolverStrategy: 'keep-v1' }),
    ])
    expect(migrationResolverOf(plan)).toBe(getAddress(CUSTOM_RESOLVER))
    expect(plan.profiles.size).toBe(0)
    expect(phasesOf(plan)).toEqual(['migrate'])
  })

  it('is not blocked by the locked resolver record-safety guard', async () => {
    // A *known* resolver on a locked name is rotated to the V2 DefaultResolver
    // and hard-blocks when records exist. A custom resolver is kept as-is, so
    // the same records pass through silently.
    await expect(
      planFor(
        {
          ...wrapped({
            fuses: FUSES.CANNOT_UNWRAP | FUSES.CANNOT_SET_RESOLVER,
          }),
          resolverAddress: CUSTOM_RESOLVER,
        },
        'locked-2ld',
      ),
    ).resolves.toBeDefined()

    await expect(
      planFor(
        {
          ...wrapped({
            fuses: FUSES.CANNOT_UNWRAP | FUSES.CANNOT_SET_RESOLVER,
          }),
          resolverAddress: KNOWN_PUBLIC_RESOLVER,
        },
        'locked-2ld',
      ),
    ).rejects.toMatchObject({
      name: 'LockedResolverRecordSafetyError',
      reason: 'records-not-replayable',
      textRecordCount: 1,
      addressRecordCount: 1,
    })
  })
})
