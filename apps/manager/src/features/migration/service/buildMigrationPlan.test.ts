import { computeResolverAddress } from '@ens-apps/smart-account'
import { err, ok } from 'neverthrow'
import { type Address, type Hex, namehash, type PublicClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeClassified, makeDomain, OWNER } from './_fixtures'
import { buildAtomicMigrationBatches } from './buildAtomicMigrationBatches'
import {
  assertLockedResolverReplacementRecordSafety,
  buildMigrationPlan,
  buildMigrationRecoveryPlan,
} from './buildMigrationPlan'
import { FUSES } from './classifyNames'
import type { MigrationPreflight } from './computeMigrationPreflight'
import { assertCopyMigrationReadiness } from './copyMigrationReadiness'
import {
  type MigrationRecoverySnapshot,
  persistPendingAtomicMigrationIntent,
  persistSubmittedAtomicMigrationBatch,
} from './migrationBatchJournal'
import { getV1ProfileKeys } from './v1SubgraphClient'

vi.mock('./v1SubgraphClient', async (importActual) => ({
  ...(await importActual<typeof import('./v1SubgraphClient')>()),
  getV1ProfileKeys: vi.fn(),
}))
vi.mock('./buildAtomicMigrationBatches', async (importActual) => ({
  ...(await importActual<typeof import('./buildAtomicMigrationBatches')>()),
  buildAtomicMigrationBatches: vi.fn(),
}))
vi.mock('./copyMigrationReadiness', () => ({
  assertCopyMigrationReadiness: vi.fn(() => Promise.resolve()),
}))
vi.mock('./migrationInvariants', async (importActual) => ({
  ...(await importActual<typeof import('./migrationInvariants')>()),
  assertRequiredMigrationContractCode: vi.fn(() => Promise.resolve()),
  assertMigrationHelperRuntimeCode: vi.fn(() => Promise.resolve()),
  assertLockedPublicResolverSetMembership: vi.fn(() => Promise.resolve()),
  checkMigrationHcaReadiness: vi.fn(({ hca }) =>
    Promise.resolve({ status: 'verified', hca, implementation: HCA }),
  ),
  checkDeterministicMigrationResolverReadiness: vi.fn(({ hca, publicClient }) =>
    Promise.resolve({
      status: 'verified',
      resolver: computeResolverAddress({
        chainId: publicClient.chain?.id ?? 11155111,
        hca,
      }),
      implementation: HCA,
      hcaHasRootRoles: true,
      walletHasWildcardRoles: true,
    }),
  ),
}))

const getV1ProfileKeysMock = vi.mocked(getV1ProfileKeys)
const buildAtomicMigrationBatchesMock = vi.mocked(buildAtomicMigrationBatches)
const assertCopyMigrationReadinessMock = vi.mocked(assertCopyMigrationReadiness)
const HCA: Address = '0x00000000000000000000000000000000000000ca'
const KNOWN_PUBLIC_RESOLVER: Address =
  '0x640294a2b2d87e7f522db3e3e3e876764bce170d'
const CUSTOM_RESOLVER: Address = '0x00000000000000000000000000000000000000cc'

const publicClientWithProfileResults = (
  results: readonly {
    readonly status: 'success'
    readonly result: unknown
  }[] = [],
): PublicClient =>
  ({
    multicall: vi.fn(() => Promise.resolve(results)),
  }) as unknown as PublicClient

const lockedKnownResolver = () =>
  makeClassified({
    id: namehash('alice.eth'),
    tokenType: 'locked-2ld',
    fuses: FUSES.CANNOT_UNWRAP | FUSES.CANNOT_SET_RESOLVER,
    resolverStrategy: 'keep-v1',
    v1ResolverAddress: KNOWN_PUBLIC_RESOLVER,
  })

const makeRecoveryTree = () => {
  const root = makeDomain({
    id: namehash('alice.eth'),
    name: 'alice.eth',
    labelName: 'alice',
    resolverAddress: null,
  })
  const copy = makeDomain({
    id: namehash('sub.alice.eth'),
    name: 'sub.alice.eth',
    labelName: 'sub',
    parentName: 'alice.eth',
    registrantId: null,
    resolverAddress: null,
  })
  const snapshot = {
    registryDomains: [root, copy],
    registryOperations: [
      { name: root.name, action: 'migrate' },
      { name: copy.name, action: 'copy' },
    ],
    remainingOperations: [{ name: copy.name, action: 'copy' }],
    completedOperations: [{ name: root.name, action: 'migrate' }],
    profiles: new Map([
      [
        namehash(root.name),
        { texts: [], addresses: [], contentHash: null, abis: [] },
      ],
      [
        namehash(copy.name),
        {
          texts: [{ key: 'url', value: 'https://example.test' }],
          addresses: [],
          contentHash: null,
          abis: [],
        },
      ],
    ]),
    ownedPermRes: computeResolverAddress({
      chainId: 11155111,
      hca: HCA,
    }),
    plannedApprovals: [{ id: 'eth-registry:hca' }],
  } satisfies MigrationRecoverySnapshot
  return { root, copy, snapshot }
}

beforeEach(() => {
  localStorage.clear()
  getV1ProfileKeysMock.mockReset()
  buildAtomicMigrationBatchesMock.mockReset()
  buildAtomicMigrationBatchesMock.mockResolvedValue({
    resolver: HCA,
    batches: [],
  })
  assertCopyMigrationReadinessMock.mockReset()
  assertCopyMigrationReadinessMock.mockResolvedValue(undefined)
})

describe('assertLockedResolverReplacementRecordSafety', () => {
  it('allows replacement after proving the supported inventory is empty', async () => {
    const name = lockedKnownResolver()
    getV1ProfileKeysMock.mockReturnValueOnce(
      ok([
        {
          id: name.domain.id,
          texts: [],
          coinTypes: [],
          contentHash: null,
          abiContentTypes: [],
        },
      ]) as never,
    )

    await expect(
      assertLockedResolverReplacementRecordSafety(
        [name],
        publicClientWithProfileResults(),
      ),
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
          contentHash: null,
          abiContentTypes: [],
        },
      ]) as never,
    )

    await expect(
      assertLockedResolverReplacementRecordSafety(
        [name],
        publicClientWithProfileResults([
          { status: 'success', result: 'a@b.c' },
          { status: 'success', result: '0x1234' as Hex },
        ]),
      ),
    ).rejects.toMatchObject({
      name: 'LockedResolverRecordSafetyError',
      ensName: name.domain.name,
      reason: 'records-not-replayable',
      textRecordCount: 1,
      addressRecordCount: 1,
    })
  })

  it('blocks replacement when only contenthash and ABI records exist', async () => {
    const name = lockedKnownResolver()
    getV1ProfileKeysMock.mockReturnValueOnce(
      ok([
        {
          id: name.domain.id,
          texts: [],
          coinTypes: [],
          contentHash: '0xe301',
          abiContentTypes: [1n],
        },
      ]) as never,
    )

    await expect(
      assertLockedResolverReplacementRecordSafety(
        [name],
        publicClientWithProfileResults([
          { status: 'success', result: '0xe301' as Hex },
          { status: 'success', result: [1n, '0x5b5d' as Hex] },
        ]),
      ),
    ).rejects.toMatchObject({
      name: 'LockedResolverRecordSafetyError',
      reason: 'records-not-replayable',
      contentHashRecordCount: 1,
      abiRecordCount: 1,
    })
  })

  it('fails closed when the inventory is missing or unavailable', async () => {
    const name = lockedKnownResolver()
    getV1ProfileKeysMock.mockReturnValueOnce(ok([]) as never)
    await expect(
      assertLockedResolverReplacementRecordSafety(
        [name],
        publicClientWithProfileResults(),
      ),
    ).rejects.toMatchObject({ reason: 'inventory-missing' })

    const cause = new Error('subgraph unavailable')
    getV1ProfileKeysMock.mockReturnValueOnce(err(cause) as never)
    await expect(
      assertLockedResolverReplacementRecordSafety(
        [name],
        publicClientWithProfileResults(),
      ),
    ).rejects.toMatchObject({ reason: 'inventory-unavailable', cause })
  })

  it('does not inspect custom or atomically replayable resolver paths', async () => {
    await expect(
      assertLockedResolverReplacementRecordSafety(
        [
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
        ],
        publicClientWithProfileResults(),
      ),
    ).resolves.toBeUndefined()
    expect(getV1ProfileKeysMock).not.toHaveBeenCalled()
  })
})

describe('buildMigrationPlan resolver preservation', () => {
  it('never routes a custom resolver to the HCA resolver from a partial inventory', async () => {
    const domain = makeDomain({ resolverAddress: CUSTOM_RESOLVER })
    const preflight: MigrationPreflight = {
      skipFetchProfilesPhase: true,
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

describe('buildMigrationRecoveryPlan', () => {
  it('rebuilds unsent copies with their completed root retained only as registry context', async () => {
    const { root, copy, snapshot } = makeRecoveryTree()

    const plan = await buildMigrationRecoveryPlan({
      snapshot,
      hcaAddress: HCA,
      migrationOwner: OWNER,
      publicClient: { chain: { id: 11155111 } } as PublicClient,
    })

    expect(plan.classified).toEqual([
      expect.objectContaining({
        action: 'copy',
        domain: expect.objectContaining({ name: copy.name }),
        managerAddress: null,
      }),
    ])
    expect(plan.registryContext.map(({ domain }) => domain.name)).toEqual([
      root.name,
      copy.name,
    ])
    expect(plan.priorCompletedOperations).toEqual([
      { name: root.name, action: 'migrate' },
    ])
    expect(plan.requiresReconciliation).toBe(true)
    expect(plan.preflight.migrationApprovals).toEqual([
      expect.objectContaining({
        kind: 'operator',
        id: 'eth-registry:hca',
        operatorAddress: HCA,
      }),
    ])
    expect(buildAtomicMigrationBatchesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        classified: [expect.objectContaining({ action: 'copy' })],
        registryContext: [
          expect.objectContaining({ action: 'migrate' }),
          expect.objectContaining({ action: 'copy' }),
        ],
      }),
    )
  })

  it('ignores journaled names outside the durable tree on reload', async () => {
    const { copy, snapshot } = makeRecoveryTree()
    const scope = { chainId: 11155111, owner: OWNER, hca: HCA }
    persistPendingAtomicMigrationIntent(scope, {
      id: 'current-copy-intent',
      names: [copy.name],
      operations: [{ name: copy.name, action: 'copy' }],
    })
    persistSubmittedAtomicMigrationBatch(scope, {
      intentId: 'abandoned-direct-intent',
      hash: `0x${'9'.repeat(64)}`,
      names: ['unrelated.eth'],
      operations: [{ name: 'unrelated.eth', action: 'migrate' }],
    })

    await expect(
      buildMigrationRecoveryPlan({
        snapshot,
        hcaAddress: HCA,
        migrationOwner: OWNER,
        publicClient: { chain: { id: 11155111 } } as PublicClient,
      }),
    ).resolves.toBeDefined()

    expect(assertCopyMigrationReadinessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recordedAttemptNames: new Set([copy.name]),
      }),
    )
  })

  it('fails closed when a durable-tree name has a different journaled action', async () => {
    const { copy, snapshot } = makeRecoveryTree()
    persistPendingAtomicMigrationIntent(
      { chainId: 11155111, owner: OWNER, hca: HCA },
      {
        id: 'mismatched-copy-intent',
        names: [copy.name],
        operations: [{ name: copy.name, action: 'migrate' }],
      },
    )

    await expect(
      buildMigrationRecoveryPlan({
        snapshot,
        hcaAddress: HCA,
        migrationOwner: OWNER,
        publicClient: { chain: { id: 11155111 } } as PublicClient,
      }),
    ).rejects.toMatchObject({
      name: 'MigrationRecoveryPlanError',
      reason: 'operation-mismatch',
    })
    expect(assertCopyMigrationReadinessMock).not.toHaveBeenCalled()
  })
})
