import { computeResolverAddress } from '@ens-apps/smart-account'
import { Storage } from 'happy-dom'
import { err, ok } from 'neverthrow'
import {
  type Address,
  type Hex,
  namehash,
  type PublicClient,
  zeroHash,
} from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeClassified, makeDomain, OWNER } from './_fixtures'
import { buildAtomicMigrationBatches } from './buildAtomicMigrationBatches'
import {
  assertLockedResolverReplacementRecordSafety,
  buildMigrationPlan,
  buildMigrationRecoveryPlan,
  namesWithDroppedPubkey,
} from './buildMigrationPlan'
import { type ClassifiedName, FUSES } from './classifyNames'
import type { MigrationPreflight } from './computeMigrationPreflight'
import { assertCopyMigrationReadiness } from './copyMigrationReadiness'
import type { Profile } from './fetchV1Profiles'
import {
  type MigrationRecoverySnapshot,
  persistPendingAtomicMigrationIntent,
  persistSubmittedAtomicMigrationBatch,
} from './migrationBatchJournal'
import { assertRequiredMigrationContractCode } from './migrationInvariants'
import { getV1ProfileKeys } from './v1ProfileKeys'

vi.mock('./v1ProfileKeys', async (importActual) => ({
  ...(await importActual<typeof import('./v1ProfileKeys')>()),
  getV1ProfileKeys: vi.fn(),
}))
vi.mock('./buildAtomicMigrationBatches', async (importActual) => ({
  ...(await importActual<typeof import('./buildAtomicMigrationBatches')>()),
  buildAtomicMigrationBatches: vi.fn(),
}))
vi.mock('./copyMigrationReadiness', () => ({
  assertCopyMigrationReadiness: vi.fn(() => Promise.resolve()),
}))
const applySubnameRecreationMock = vi.hoisted(() => vi.fn())

vi.mock('./subnameRecreation', async (importActual) => {
  const actual = await importActual<typeof import('./subnameRecreation')>()
  applySubnameRecreationMock.mockImplementation(actual.applySubnameRecreation)
  return { ...actual, applySubnameRecreation: applySubnameRecreationMock }
})

vi.mock('./migrationInvariants', async (importActual) => ({
  ...(await importActual<typeof import('./migrationInvariants')>()),
  assertRequiredMigrationContractCode: vi.fn(() => Promise.resolve()),
  resolveLockedMigrationResolvers: vi.fn(({ names }) =>
    Promise.resolve([...names]),
  ),
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
      writer: 'hca',
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

const UNSET_PUBKEY = {
  status: 'success',
  result: [zeroHash, zeroHash],
} as const

const publicClientWithProfileResults = (
  results: readonly {
    readonly status: 'success'
    readonly result: unknown
  }[] = [],
): PublicClient =>
  ({
    // The recovery plan resolves its chain from the client and refuses a
    // client without one.
    chain: { id: 11155111 },
    getCode: vi.fn().mockResolvedValue('0x'),
    multicall: vi.fn(() => Promise.resolve(results)),
    readContract: vi.fn().mockResolvedValue(false),
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
        {
          texts: [],
          addresses: [],
          contentHash: null,
          abis: [],
          interfaces: [],
          pubkey: null,
        },
      ],
      [
        namehash(copy.name),
        {
          texts: [{ key: 'url', value: 'https://example.test' }],
          addresses: [],
          contentHash: null,
          abis: [],
          interfaces: [],
          pubkey: null,
        },
      ],
    ]),
    ownedPermRes: computeResolverAddress({
      chainId: 11155111,
      hca: HCA,
    }),
    plannedApprovals: [{ id: 'eth-registry:hca' }],
    managerRestorationNames: [],
  } satisfies MigrationRecoverySnapshot
  return { root, copy, snapshot }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new Storage())
  getV1ProfileKeysMock.mockReset()
  buildAtomicMigrationBatchesMock.mockReset()
  buildAtomicMigrationBatchesMock.mockResolvedValue({
    resolver: HCA,
    batches: [],
  })
  assertCopyMigrationReadinessMock.mockReset()
  assertCopyMigrationReadinessMock.mockResolvedValue(new Map())
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
          hasContentHash: false,
          abiContentTypes: [],
          interfaceIds: [],
        },
      ]) as never,
    )

    await expect(
      assertLockedResolverReplacementRecordSafety(
        [name],
        publicClientWithProfileResults([UNSET_PUBKEY]),
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
          hasContentHash: false,
          abiContentTypes: [],
          interfaceIds: [],
        },
      ]) as never,
    )

    await expect(
      assertLockedResolverReplacementRecordSafety(
        [name],
        publicClientWithProfileResults([
          { status: 'success', result: 'a@b.c' },
          { status: 'success', result: '0x1234' as Hex },
          UNSET_PUBKEY,
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
          hasContentHash: true,
          abiContentTypes: [1n],
          interfaceIds: [],
        },
      ]) as never,
    )

    await expect(
      assertLockedResolverReplacementRecordSafety(
        [name],
        publicClientWithProfileResults([
          { status: 'success', result: '0xe301' as Hex },
          { status: 'success', result: [1n, '0x5b5d' as Hex] },
          UNSET_PUBKEY,
        ]),
      ),
    ).rejects.toMatchObject({
      name: 'LockedResolverRecordSafetyError',
      reason: 'records-not-replayable',
      contentHashRecordCount: 1,
      abiRecordCount: 1,
    })
  })

  it('blocks replacement when only interface and pubkey records exist', async () => {
    const name = lockedKnownResolver()
    getV1ProfileKeysMock.mockReturnValueOnce(
      ok([
        {
          id: name.domain.id,
          texts: [],
          coinTypes: [],
          contentHash: null,
          abiContentTypes: [],
          interfaceIds: ['0x01ffc9a7'],
        },
      ]) as never,
    )

    await expect(
      assertLockedResolverReplacementRecordSafety(
        [name],
        publicClientWithProfileResults([
          {
            status: 'success',
            result: '0x000000000000000000000000000000000000beef' as Address,
          },
          { status: 'success', result: [`0x${'aa'.repeat(32)}`, zeroHash] },
        ]),
      ),
    ).rejects.toMatchObject({
      name: 'LockedResolverRecordSafetyError',
      reason: 'records-not-replayable',
      interfaceRecordCount: 1,
      pubkeyRecordCount: 1,
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

    const cause = new Error('bigname unavailable')
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

describe('namesWithDroppedPubkey', () => {
  it('lists only names moving to the owned resolver that have a pubkey', () => {
    const profile = (pubkey: Profile['pubkey']) =>
      ({ pubkey }) as unknown as Profile
    const pubkey = { x: zeroHash, y: `0x${'aa'.repeat(32)}` } as const

    expect(
      namesWithDroppedPubkey({
        classified: [
          makeClassified({
            name: 'a.eth',
            resolverStrategy: 'to-owned-permres',
          }),
          makeClassified({
            name: 'b.eth',
            resolverStrategy: 'to-owned-permres',
          }),
          makeClassified({
            name: 'c.eth',
            resolverStrategy: 'keep-v1',
            v1ResolverAddress: CUSTOM_RESOLVER,
          }),
        ],
        profiles: new Map([
          [namehash('a.eth'), profile(pubkey)],
          [namehash('b.eth'), profile(null)],
          [namehash('c.eth'), profile(pubkey)],
        ]),
      }),
    ).toEqual(['a.eth'])
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
      publicClient: {
        chain: { id: 11155111 },
        getCode: vi.fn().mockResolvedValue('0x'),
      } as unknown as PublicClient,
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
        maxOuterGas: 15_000_000n,
      }),
    )
  })
})

describe('buildMigrationPlan gas preview', () => {
  it('prices the wallet replay from the wallet executions only', async () => {
    await buildMigrationPlan({
      domains: [makeDomain()],
      hcaAddress: HCA,
      migrationOwner: OWNER,
      publicClient: {
        chain: { id: 11155111 },
        getCode: vi.fn().mockResolvedValue('0x'),
      } as unknown as PublicClient,
      preflight: {
        skipFetchProfilesPhase: true,
        hcaReadiness: { status: 'deployment-required', hca: HCA },
      },
    })
    const estimate =
      buildAtomicMigrationBatchesMock.mock.calls[0]?.[0].estimateBatchGas
    if (!estimate) throw new Error('preview estimator was not passed')
    const execution = {
      phase: 'wallet-co-admin-grant',
      name: 'alice.eth',
      names: ['alice.eth'],
      call: { to: HCA, data: '0x', value: 0n },
    } as const
    const request = {
      call: execution.call,
      walletCall: null,
      names: [],
    }

    expect(
      await estimate({
        ...request,
        innerExecutions: [execution],
        walletExecutions: [],
      }),
    ).toEqual({ outerGas: 150_000n, walletGas: 0n })
    expect(
      await estimate({
        ...request,
        innerExecutions: [],
        walletExecutions: [execution],
      }),
    ).toEqual({ outerGas: 80_000n, walletGas: 70_000n })
  })
})

describe('buildMigrationRecoveryPlan', () => {
  it('converts a saved collection-wide registration grant to token approvals', async () => {
    const { root, copy, snapshot } = makeRecoveryTree()
    const recoverySnapshot: MigrationRecoverySnapshot = {
      ...snapshot,
      remainingOperations: [
        { name: root.name, action: 'migrate' },
        { name: copy.name, action: 'copy' },
      ],
      completedOperations: [],
      plannedApprovals: [{ id: 'base-registrar:hca' }],
    }

    const plan = await buildMigrationRecoveryPlan({
      snapshot: recoverySnapshot,
      hcaAddress: HCA,
      migrationOwner: OWNER,
      publicClient: publicClientWithProfileResults(),
    })

    expect(plan.preflight.migrationApprovals).toEqual([
      expect.objectContaining({
        kind: 'erc721-token',
        id: 'base-registrar:hca-token',
      }),
    ])
  })

  it('resumes a recreation tree without an ETHRegistry approval it never planned', async () => {
    const { root, copy, snapshot } = makeRecoveryTree()
    // Only the tree's shape matters here, not its saved source identity.
    applySubnameRecreationMock.mockImplementationOnce(
      ({ classified }: { readonly classified: readonly ClassifiedName[] }) => [
        ...classified,
        {
          ...makeClassified({
            action: 'copy',
            tokenType: 'registry-child',
            name: copy.name,
            label: 'sub',
            parentName: root.name,
          }),
          domain: copy,
          recreationRoot: root.name,
        },
      ],
    )

    const plan = await buildMigrationRecoveryPlan({
      snapshot: {
        ...snapshot,
        remainingOperations: [
          { name: root.name, action: 'migrate' },
          { name: copy.name, action: 'copy' },
        ],
        completedOperations: [],
        plannedApprovals: [],
        subnameRecreation: {
          version: 5,
          roots: [root.name],
          names: [root.name, copy.name],
          blockNumber: '100',
          timestamp: '1000',
          blockHash: `0x${'11'.repeat(32)}`,
          chainId: 11155111,
          inventoryDigest: `0x${'22'.repeat(32)}`,
        },
      },
      hcaAddress: HCA,
      migrationOwner: OWNER,
      publicClient: publicClientWithProfileResults(),
    })

    expect(plan.registryContext).toContainEqual(
      expect.objectContaining({ recreationRoot: root.name }),
    )
    expect(plan.preflight.migrationApprovals).toEqual([])
    expect(plan.preflight.migrationCleanupApprovals).toEqual([])
  })

  it('rebuilds unsent copies with their completed root retained only as registry context', async () => {
    const { root, copy, snapshot } = makeRecoveryTree()

    const plan = await buildMigrationRecoveryPlan({
      snapshot,
      hcaAddress: HCA,
      migrationOwner: OWNER,
      publicClient: {
        chain: { id: 11155111 },
        getCode: vi.fn().mockResolvedValue('0x'),
      } as unknown as PublicClient,
    })

    const checkedContracts = vi.mocked(assertRequiredMigrationContractCode).mock
      .lastCall?.[0].contracts
    expect(checkedContracts).toContain('UserRegistryImpl')
    expect(checkedContracts).toContain('ETHRegistry')
    expect(checkedContracts).not.toContain('MigrationHelper')
    expect(checkedContracts).not.toContain('UnlockedMigrationController')
    expect(checkedContracts).not.toContain('VerifiableFactoryProxyLogic')
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
        maxOuterGas: 15_000_000n,
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
        publicClient: {
          chain: { id: 11155111 },
          getCode: vi.fn().mockResolvedValue('0x'),
        } as unknown as PublicClient,
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
        publicClient: {
          chain: { id: 11155111 },
          getCode: vi.fn().mockResolvedValue('0x'),
        } as unknown as PublicClient,
      }),
    ).rejects.toMatchObject({
      name: 'MigrationRecoveryPlanError',
      reason: 'operation-mismatch',
    })
    expect(assertCopyMigrationReadinessMock).not.toHaveBeenCalled()
  })
})

describe('buildMigrationRecoveryPlan manager restoration (WEB-1528)', () => {
  const CONTROLLER: Address = '0x00000000000000000000000000000000000000c1'

  const makeResumedRoot = (managerRestorationNames: readonly string[]) => {
    const root = makeDomain({
      id: namehash('alice.eth'),
      name: 'alice.eth',
      labelName: 'alice',
      resolverAddress: null,
      ownerId: CONTROLLER,
    })
    const snapshot = {
      registryDomains: [root],
      registryOperations: [{ name: root.name, action: 'migrate' as const }],
      remainingOperations: [{ name: root.name, action: 'migrate' as const }],
      completedOperations: [],
      profiles: new Map([
        [
          namehash(root.name),
          {
            texts: [],
            addresses: [],
            contentHash: null,
            abis: [],
            interfaces: [],
            pubkey: null,
          },
        ],
      ]),
      ownedPermRes: computeResolverAddress({ chainId: 11155111, hca: HCA }),
      plannedApprovals: [{ id: 'eth-registry:hca' as const }],
      managerRestorationNames,
    } satisfies MigrationRecoverySnapshot
    return { root, snapshot }
  }

  const resume = (snapshot: MigrationRecoverySnapshot) =>
    buildMigrationRecoveryPlan({
      snapshot,
      hcaAddress: HCA,
      migrationOwner: OWNER,
      publicClient: {
        chain: { id: 11155111 },
        getCode: vi.fn().mockResolvedValue('0x'),
      } as unknown as PublicClient,
    })

  it('replays the opt-in recorded on the durable snapshot', async () => {
    const { root, snapshot } = makeResumedRoot(['alice.eth'])
    const plan = await resume(snapshot)

    expect(plan.classified).toEqual([
      expect.objectContaining({
        domain: expect.objectContaining({ name: root.name }),
        managerAddress: CONTROLLER,
      }),
    ])
  })

  it('restores nobody when the snapshot recorded no opt-in', async () => {
    const { snapshot } = makeResumedRoot([])
    const plan = await resume(snapshot)

    expect(plan.classified[0]?.managerAddress).toBeNull()
  })

  it('does not re-derive an opt-in from the live v1 controller', async () => {
    // The controller still differs from the registrant on resume, so a plan
    // that re-derived the grant would silently reinstate it.
    const { snapshot } = makeResumedRoot([])
    const plan = await resume(snapshot)

    expect(plan.classified[0]?.registryController).toBe(CONTROLLER)
    expect(plan.classified[0]?.managerAddress).toBeNull()
  })
})
