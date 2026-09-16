import { Storage } from 'happy-dom'
import { err, ok } from 'neverthrow'
import { type Address, type Hex, namehash, zeroAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPublicClient: vi.fn(),
  getV1NamesForAddress: vi.fn(),
  getMigratedNamesCount: vi.fn(),
  runEligibilityChecks: vi.fn(),
}))

vi.mock('@wagmi/core', () => ({ getPublicClient: mocks.getPublicClient }))
vi.mock('../service/v1SubgraphClient', () => ({
  getV1NamesForAddress: mocks.getV1NamesForAddress,
}))
vi.mock('../service/getMigratedNamesCount', () => ({
  getMigratedNamesCount: mocks.getMigratedNamesCount,
}))
vi.mock('../service/preflightChecks', () => ({
  runEligibilityChecks: mocks.runEligibilityChecks,
}))

import { makeDomain } from '../service/_fixtures'
import { type ClassifiedName, classifyNames } from '../service/classifyNames'
import {
  persistMigrationRecoverySnapshot,
  persistPendingAtomicMigrationIntent,
  persistSubmittedAtomicMigrationBatch,
} from '../service/migrationBatchJournal'
import {
  type CommemorativeNftMigrationCompletionParams,
  commemorativeNftMigrationCompletionQueryOptions,
  fetchCommemorativeNftMigrationCompletion,
} from './migrationCompletion'
import type { VerifiedNftMigration } from './verifiedMigration'

const ownerAddress = '0x0000000000000000000000000000000000000001' as Address
const hcaAddress = '0x0000000000000000000000000000000000000002' as Address
const params: CommemorativeNftMigrationCompletionParams = {
  ownerAddress,
  hcaAddress,
  chainId: sepolia.id,
  wagmiConfig: {} as CommemorativeNftMigrationCompletionParams['wagmiConfig'],
}
const scope = { owner: ownerAddress, hca: hcaAddress, chainId: sepolia.id }
const verifiedMigration: VerifiedNftMigration = {
  ownerAddress,
  hcaAddress,
  chainId: sepolia.id,
  completedOperations: [{ name: 'alice.eth', action: 'migrate' }],
}
const publicClient = { chain: { id: sepolia.id } }
const domain = makeDomain({
  id: namehash('alice.eth'),
  name: 'alice.eth',
  labelName: 'alice',
})
const classified = classifyNames([domain], ownerAddress).classified
const emptyEligibility = () => ({
  eligible: [] as ClassifiedName[],
  frozen: [] as ClassifiedName[],
  alreadyMigrated: [] as ClassifiedName[],
  notPremigrated: [] as ClassifiedName[],
  failed: [] as ClassifiedName[],
})
const pendingIntent = {
  id: 'pending-alice',
  names: ['alice.eth'],
  operations: [{ name: 'alice.eth', action: 'migrate' as const }],
}
const submittedBatch = {
  intentId: 'submitted-alice',
  hash: `0x${'1'.repeat(64)}` as Hex,
  names: ['alice.eth'],
  operations: [{ name: 'alice.eth', action: 'migrate' as const }],
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new Storage())
  vi.resetAllMocks()
  mocks.getPublicClient.mockReturnValue(publicClient)
  mocks.getV1NamesForAddress.mockResolvedValue(ok([]))
  mocks.getMigratedNamesCount.mockResolvedValue(ok(1))
  mocks.runEligibilityChecks.mockResolvedValue(emptyEligibility())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('commemorative NFT migration completion', () => {
  it.each([
    'ownerAddress',
    'hcaAddress',
  ] as const)('rejects a missing %s even when manually refetched', async (addressKey) => {
    await expect(
      fetchCommemorativeNftMigrationCompletion({
        ...params,
        [addressKey]: zeroAddress,
      }),
    ).rejects.toThrow('The migration account could not be checked.')
    expect(mocks.getV1NamesForAddress).not.toHaveBeenCalled()
  })

  it('keeps a wallet locked while an eligible V1 name remains', async () => {
    mocks.getV1NamesForAddress.mockResolvedValue(ok([domain]))
    mocks.runEligibilityChecks.mockResolvedValue({
      ...emptyEligibility(),
      eligible: classified,
    })

    await expect(
      fetchCommemorativeNftMigrationCompletion(params),
    ).resolves.toEqual({
      isComplete: false,
      remainingNameCount: 1,
      migratedNameCount: 1,
    })
    expect(mocks.getV1NamesForAddress).toHaveBeenCalledWith(ownerAddress)
    expect(mocks.runEligibilityChecks).toHaveBeenCalledWith(
      publicClient,
      classified,
      ownerAddress,
    )
    expect(mocks.getPublicClient).toHaveBeenCalledWith(params.wagmiConfig, {
      chainId: sepolia.id,
    })
  })

  it('unlocks only with no eligible names and positive migrated evidence', async () => {
    mocks.getV1NamesForAddress.mockResolvedValue(ok([domain]))
    mocks.runEligibilityChecks.mockResolvedValue({
      ...emptyEligibility(),
      alreadyMigrated: classified,
    })
    mocks.getMigratedNamesCount.mockResolvedValue(ok(3))

    await expect(
      fetchCommemorativeNftMigrationCompletion(params),
    ).resolves.toEqual({
      isComplete: true,
      remainingNameCount: 0,
      migratedNameCount: 3,
    })
    expect(mocks.getMigratedNamesCount).toHaveBeenCalledWith(ownerAddress)
  })

  it('does not treat an empty wallet as evidence of migration', async () => {
    mocks.getMigratedNamesCount.mockResolvedValue(ok(0))
    await expect(
      fetchCommemorativeNftMigrationCompletion(params),
    ).resolves.toEqual({
      isComplete: false,
      remainingNameCount: 0,
      migratedNameCount: 0,
    })
  })

  it('unlocks after verified success even before the migrated index catches up', async () => {
    mocks.getMigratedNamesCount.mockResolvedValue(ok(0))
    mocks.getV1NamesForAddress.mockResolvedValue(ok([domain]))
    mocks.runEligibilityChecks.mockResolvedValue({
      ...emptyEligibility(),
      alreadyMigrated: classified,
    })

    await expect(
      fetchCommemorativeNftMigrationCompletion({
        ...params,
        verifiedMigration,
      }),
    ).resolves.toEqual({
      isComplete: true,
      remainingNameCount: 0,
      migratedNameCount: 1,
    })
    expect(mocks.getMigratedNamesCount).not.toHaveBeenCalled()
    expect(mocks.getV1NamesForAddress).toHaveBeenCalledWith(ownerAddress)
    expect(mocks.runEligibilityChecks).toHaveBeenCalled()
  })

  it('does not let verified success bypass a remaining eligible name', async () => {
    mocks.getV1NamesForAddress.mockResolvedValue(ok([domain]))
    mocks.runEligibilityChecks.mockResolvedValue({
      ...emptyEligibility(),
      eligible: classified,
    })

    await expect(
      fetchCommemorativeNftMigrationCompletion({
        ...params,
        verifiedMigration,
      }),
    ).resolves.toMatchObject({ isComplete: false, remainingNameCount: 1 })
  })

  it('does not let verified success bypass unfinished journal work', async () => {
    persistSubmittedAtomicMigrationBatch(scope, submittedBatch)

    await expect(
      fetchCommemorativeNftMigrationCompletion({
        ...params,
        verifiedMigration,
      }),
    ).resolves.toMatchObject({ isComplete: false, remainingNameCount: 1 })
  })

  it('still fails closed on a failed preflight after verified success', async () => {
    mocks.runEligibilityChecks.mockResolvedValue({
      ...emptyEligibility(),
      failed: classified,
    })

    await expect(
      fetchCommemorativeNftMigrationCompletion({
        ...params,
        verifiedMigration,
      }),
    ).rejects.toThrow('Some ENSv1 names could not be checked')
  })

  it.each([
    { ownerAddress: '0x0000000000000000000000000000000000000003' as Address },
    { hcaAddress: '0x0000000000000000000000000000000000000004' as Address },
    { chainId: 1 },
  ])('does not accept verified success from a different scope: %j', async (otherScope) => {
    mocks.getMigratedNamesCount.mockResolvedValue(ok(0))

    await expect(
      fetchCommemorativeNftMigrationCompletion({
        ...params,
        verifiedMigration: { ...verifiedMigration, ...otherScope },
      }),
    ).resolves.toMatchObject({ isComplete: false, migratedNameCount: 0 })
    expect(mocks.getMigratedNamesCount).toHaveBeenCalledWith(ownerAddress)
  })

  it.each([
    'names',
    'migrated',
  ] as const)('fails closed when the %s request fails', async (request) => {
    const failedRequest =
      request === 'names'
        ? mocks.getV1NamesForAddress
        : mocks.getMigratedNamesCount
    failedRequest.mockResolvedValue(err(new Error('request failed')))

    await expect(
      fetchCommemorativeNftMigrationCompletion(params),
    ).rejects.toThrow('could not be checked')
    expect(mocks.runEligibilityChecks).not.toHaveBeenCalled()
  })

  it('does not mistake failed RPC reads for already migrated names', async () => {
    mocks.getV1NamesForAddress.mockResolvedValue(ok([domain]))
    mocks.runEligibilityChecks.mockResolvedValue({
      ...emptyEligibility(),
      alreadyMigrated: classified,
      failed: classified,
    })

    await expect(
      fetchCommemorativeNftMigrationCompletion(params),
    ).rejects.toThrow('Some ENSv1 names could not be checked')
  })

  it('propagates a failed preflight request', async () => {
    mocks.runEligibilityChecks.mockRejectedValue(new Error('RPC unavailable'))
    await expect(
      fetchCommemorativeNftMigrationCompletion(params),
    ).rejects.toThrow('RPC unavailable')
  })

  it.each([
    -1,
    Number.NaN,
    1.5,
  ])('rejects an invalid migrated count: %s', async (count) => {
    mocks.getMigratedNamesCount.mockResolvedValue(ok(count))
    await expect(
      fetchCommemorativeNftMigrationCompletion(params),
    ).rejects.toThrow('name count is invalid')
  })

  it('blocks unfinished child copies even after their parent leaves the V1 results', async () => {
    const child = makeDomain({
      id: namehash('sub.alice.eth'),
      name: 'sub.alice.eth',
      labelName: 'sub',
      parentName: 'alice.eth',
      registrantId: null,
    })
    persistMigrationRecoverySnapshot(scope, {
      registryDomains: [domain, child],
      registryOperations: [
        { name: domain.name, action: 'migrate' },
        { name: child.name, action: 'copy' },
      ],
      remainingOperations: [{ name: child.name, action: 'copy' }],
      completedOperations: [{ name: domain.name, action: 'migrate' }],
      profiles: new Map(),
      ownedPermRes: null,
      plannedApprovals: [],
    })

    await expect(
      fetchCommemorativeNftMigrationCompletion(params),
    ).resolves.toEqual({
      isComplete: false,
      remainingNameCount: 1,
      migratedNameCount: 1,
    })
  })

  it.each([
    'pending',
    'submitted',
  ] as const)('blocks %s journal work and deduplicates the live remaining name', async (state) => {
    if (state === 'pending')
      persistPendingAtomicMigrationIntent(scope, pendingIntent)
    else persistSubmittedAtomicMigrationBatch(scope, submittedBatch)
    mocks.getV1NamesForAddress.mockResolvedValue(ok([domain]))
    mocks.runEligibilityChecks.mockResolvedValue({
      ...emptyEligibility(),
      eligible: classified,
    })

    await expect(
      fetchCommemorativeNftMigrationCompletion(params),
    ).resolves.toEqual({
      isComplete: false,
      remainingNameCount: 1,
      migratedNameCount: 1,
    })
  })

  it('rechecks journal work created while preflight is running', async () => {
    mocks.runEligibilityChecks.mockImplementation(async () => {
      persistPendingAtomicMigrationIntent(scope, pendingIntent)
      return emptyEligibility()
    })

    await expect(
      fetchCommemorativeNftMigrationCompletion(params),
    ).resolves.toEqual({
      isComplete: false,
      remainingNameCount: 1,
      migratedNameCount: 1,
    })
  })

  it.each([
    { owner: '0x0000000000000000000000000000000000000003' as Address },
    { hca: '0x0000000000000000000000000000000000000004' as Address },
    { chainId: 1 },
  ])('ignores journal work from a different scope: %j', async (otherScope) => {
    persistPendingAtomicMigrationIntent(
      { ...scope, ...otherScope },
      pendingIntent,
    )
    await expect(
      fetchCommemorativeNftMigrationCompletion(params),
    ).resolves.toMatchObject({
      isComplete: true,
      remainingNameCount: 0,
    })
  })

  it('fails closed when the journal is corrupt', async () => {
    persistPendingAtomicMigrationIntent(scope, pendingIntent)
    const key = localStorage.key(0)
    if (!key) throw new Error('Expected the persisted journal')
    localStorage.setItem(key, '{')

    await expect(
      fetchCommemorativeNftMigrationCompletion(params),
    ).rejects.toThrow('journal is unreadable')
    expect(mocks.getV1NamesForAddress).not.toHaveBeenCalled()
  })

  it('rejects unsupported or mismatched networks', async () => {
    await expect(
      fetchCommemorativeNftMigrationCompletion({ ...params, chainId: 1 }),
    ).rejects.toThrow('unavailable on this network')
    mocks.getPublicClient.mockReturnValue({ chain: { id: 1 } })
    await expect(
      fetchCommemorativeNftMigrationCompletion(params),
    ).rejects.toThrow('network could not be checked')
    expect(mocks.getV1NamesForAddress).not.toHaveBeenCalled()
  })

  it('uses a fresh migration-scoped query isolated by owner, HCA, chain and journal revision', () => {
    const options = commemorativeNftMigrationCompletionQueryOptions({
      ...params,
      journalRevision: 2,
    })
    expect(options.staleTime).toBe(0)
    expect(options.refetchOnMount).toBe('always')
    expect(options.queryKey[0]).toMatchObject({ $scope: 'migration' })
    for (const change of [
      { ownerAddress: '0x0000000000000000000000000000000000000003' as Address },
      { hcaAddress: '0x0000000000000000000000000000000000000004' as Address },
      { chainId: 1 },
      { journalRevision: 3 },
    ]) {
      expect(
        commemorativeNftMigrationCompletionQueryOptions({
          ...params,
          journalRevision: 2,
          ...change,
        }).queryKey,
      ).not.toEqual(options.queryKey)
    }
  })
})
