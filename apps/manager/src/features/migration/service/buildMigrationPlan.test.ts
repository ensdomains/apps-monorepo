import { err, ok } from 'neverthrow'
import type { Address, PublicClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeClassified, makeDomain, OWNER } from './_fixtures'
import { buildAtomicMigrationBatches } from './buildAtomicMigrationBatches'
import {
  assertLockedResolverReplacementRecordSafety,
  buildMigrationPlan,
} from './buildMigrationPlan'
import { FUSES } from './classifyNames'
import type { MigrationPreflight } from './computeMigrationPreflight'
import { getV1ProfileKeys } from './v1SubgraphClient'

vi.mock('./v1SubgraphClient', async (importActual) => ({
  ...(await importActual<typeof import('./v1SubgraphClient')>()),
  getV1ProfileKeys: vi.fn(),
}))
vi.mock('./buildAtomicMigrationBatches', async (importActual) => ({
  ...(await importActual<typeof import('./buildAtomicMigrationBatches')>()),
  buildAtomicMigrationBatches: vi.fn(),
}))

const getV1ProfileKeysMock = vi.mocked(getV1ProfileKeys)
const buildAtomicMigrationBatchesMock = vi.mocked(buildAtomicMigrationBatches)
const HCA: Address = '0x00000000000000000000000000000000000000ca'
const KNOWN_PUBLIC_RESOLVER: Address =
  '0x640294a2b2d87e7f522db3e3e3e876764bce170d'
const CUSTOM_RESOLVER: Address = '0x00000000000000000000000000000000000000cc'

const lockedKnownResolver = () =>
  makeClassified({
    tokenType: 'locked-2ld',
    fuses: FUSES.CANNOT_UNWRAP | FUSES.CANNOT_SET_RESOLVER,
    resolverStrategy: 'keep-v1',
    v1ResolverAddress: KNOWN_PUBLIC_RESOLVER,
  })

beforeEach(() => {
  getV1ProfileKeysMock.mockReset()
  buildAtomicMigrationBatchesMock.mockReset()
  buildAtomicMigrationBatchesMock.mockResolvedValue({
    resolver: HCA,
    batches: [],
  })
})

describe('assertLockedResolverReplacementRecordSafety', () => {
  it('allows replacement after proving the supported inventory is empty', async () => {
    const name = lockedKnownResolver()
    getV1ProfileKeysMock.mockReturnValueOnce(
      ok([{ id: name.domain.id, texts: [], coinTypes: [] }]) as never,
    )

    await expect(
      assertLockedResolverReplacementRecordSafety([name]),
    ).resolves.toBeUndefined()
  })

  it('blocks replacement when supported records cannot be replayed atomically', async () => {
    const name = lockedKnownResolver()
    getV1ProfileKeysMock.mockReturnValueOnce(
      ok([
        {
          id: name.domain.id,
          texts: ['email'],
          coinTypes: ['60'],
        },
      ]) as never,
    )

    await expect(
      assertLockedResolverReplacementRecordSafety([name]),
    ).rejects.toMatchObject({
      name: 'LockedResolverRecordSafetyError',
      ensName: name.domain.name,
      reason: 'records-not-replayable',
      textRecordCount: 1,
      addressRecordCount: 1,
    })
  })

  it('fails closed when the inventory is missing or unavailable', async () => {
    const name = lockedKnownResolver()
    getV1ProfileKeysMock.mockReturnValueOnce(ok([]) as never)
    await expect(
      assertLockedResolverReplacementRecordSafety([name]),
    ).rejects.toMatchObject({ reason: 'inventory-missing' })

    const cause = new Error('subgraph unavailable')
    getV1ProfileKeysMock.mockReturnValueOnce(err(cause) as never)
    await expect(
      assertLockedResolverReplacementRecordSafety([name]),
    ).rejects.toMatchObject({ reason: 'inventory-unavailable', cause })
  })

  it('does not inspect custom or atomically replayable resolver paths', async () => {
    await expect(
      assertLockedResolverReplacementRecordSafety([
        makeClassified({
          tokenType: 'locked-2ld',
          fuses: FUSES.CANNOT_UNWRAP | FUSES.CANNOT_SET_RESOLVER,
          resolverStrategy: 'keep-v1',
          v1ResolverAddress: CUSTOM_RESOLVER,
        }),
        makeClassified({
          tokenType: 'locked-2ld',
          fuses: FUSES.CANNOT_UNWRAP | FUSES.CANNOT_SET_RESOLVER,
          resolverStrategy: 'to-owned-permres',
          v1ResolverAddress: KNOWN_PUBLIC_RESOLVER,
        }),
      ]),
    ).resolves.toBeUndefined()
    expect(getV1ProfileKeysMock).not.toHaveBeenCalled()
  })
})

describe('buildMigrationPlan resolver preservation', () => {
  it('never routes a custom resolver to the HCA resolver from a partial inventory', async () => {
    const domain = makeDomain({ resolverAddress: CUSTOM_RESOLVER })
    const preflight: MigrationPreflight = {
      preExistingOwnedPermRes: null,
      skipApprovalPhase: true,
      skipFetchProfilesPhase: true,
      baseRegistrarApproved: true,
      nameWrapperApproved: true,
      hcaReadiness: { status: 'deployment-required', hca: HCA },
    }

    const plan = await buildMigrationPlan({
      domains: [domain],
      hcaAddress: HCA,
      migrationOwner: OWNER,
      publicClient: { chain: { id: 11155111 } } as PublicClient,
      preflight,
    })

    expect(plan.classified).toEqual([
      expect.objectContaining({
        resolverStrategy: 'keep-v1',
        v1ResolverAddress: CUSTOM_RESOLVER,
      }),
    ])
    expect(getV1ProfileKeysMock).not.toHaveBeenCalled()
    expect(buildAtomicMigrationBatchesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        classified: [expect.objectContaining({ resolverStrategy: 'keep-v1' })],
      }),
    )
  })
})
