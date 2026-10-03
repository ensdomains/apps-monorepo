import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { Storage } from 'happy-dom'
import { err, ok } from 'neverthrow'
import { type Address, type Hex, namehash, zeroAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { envConfig } from '@/config'

const mocks = vi.hoisted(() => ({
  getPublicClient: vi.fn(),
  getV1NamesForAddress: vi.fn(),
  getMigratedNamesCount: vi.fn(),
  runEligibilityChecks: vi.fn(),
  restoreCheckpoint: vi.fn(),
}))

vi.mock('../service/migrationCompletionCheckpoint', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../service/migrationCompletionCheckpoint')
  >()),
  restoreMigrationCompletionCheckpoint: mocks.restoreCheckpoint,
}))

vi.mock('./diagnostics', () => ({ trackNftEvent: vi.fn() }))

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
import * as nftConfig from './config'
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
const classified = classifyNames(
  [domain],
  ownerAddress,
  envConfig.chain.id,
).classified
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
  mocks.restoreCheckpoint.mockResolvedValue(null)
  mocks.getPublicClient.mockReturnValue(publicClient)
  mocks.getV1NamesForAddress.mockResolvedValue(ok([]))
  mocks.getMigratedNamesCount.mockResolvedValue(ok(1))
  mocks.runEligibilityChecks.mockResolvedValue(emptyEligibility())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
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
      status: 'incomplete',
      isComplete: false,
      remainingNameCount: 1,
      migratedNameCount: 1,
    })
    expect(mocks.getV1NamesForAddress).toHaveBeenCalledWith(ownerAddress, {
      signal: expect.any(AbortSignal),
    })
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
      status: 'complete',
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
      status: 'reconciling',
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
      status: 'complete',
      isComplete: true,
      remainingNameCount: 0,
      migratedNameCount: 1,
    })
    expect(mocks.getMigratedNamesCount).not.toHaveBeenCalled()
    expect(mocks.getV1NamesForAddress).toHaveBeenCalledWith(ownerAddress, {
      signal: expect.any(AbortSignal),
    })
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
      status: 'incomplete',
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
      status: 'incomplete',
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
      status: 'incomplete',
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
      status: 'complete',
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

  it('rejects undeployed or mismatched networks', async () => {
    vi.spyOn(
      nftConfig,
      'getCommemorativeNftContractAddress',
    ).mockReturnValueOnce(undefined)
    await expect(
      fetchCommemorativeNftMigrationCompletion(params),
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

describe('completion restoration and bounded reconciliation', () => {
  it('restores historical receipt evidence after reload while the indexer is still zero', async () => {
    mocks.getMigratedNamesCount.mockResolvedValue(ok(0))
    mocks.restoreCheckpoint.mockResolvedValue({
      name: 'alice.eth',
      action: 'migrate',
    })
    await expect(
      fetchCommemorativeNftMigrationCompletion(params),
    ).resolves.toMatchObject({ status: 'complete', isComplete: true })
    expect(mocks.restoreCheckpoint).toHaveBeenCalledWith({
      scope,
      publicClient,
      signal: expect.any(AbortSignal),
    })
  })

  it('keeps restored evidence blocked by fresh remaining-name checks', async () => {
    mocks.getMigratedNamesCount.mockResolvedValue(ok(0))
    mocks.restoreCheckpoint.mockResolvedValue({
      name: 'old.eth',
      action: 'migrate',
    })
    mocks.getV1NamesForAddress.mockResolvedValue(ok([domain]))
    mocks.runEligibilityChecks.mockResolvedValue({
      ...emptyEligibility(),
      eligible: classified,
    })
    await expect(
      fetchCommemorativeNftMigrationCompletion(params),
    ).resolves.toMatchObject({
      status: 'incomplete',
      isComplete: false,
      remainingNameCount: 1,
    })
  })

  it('fails closed when a stored receipt cannot be verified', async () => {
    mocks.getMigratedNamesCount.mockResolvedValue(ok(0))
    mocks.restoreCheckpoint.mockRejectedValue(new Error('Invalid receipt'))
    await expect(
      fetchCommemorativeNftMigrationCompletion(params),
    ).rejects.toThrow('Invalid receipt')
  })

  it('does not reread the receipt when positive live or current-session evidence already exists', async () => {
    await fetchCommemorativeNftMigrationCompletion(params)
    await fetchCommemorativeNftMigrationCompletion({
      ...params,
      verifiedMigration,
    })
    expect(mocks.restoreCheckpoint).not.toHaveBeenCalled()
  })

  it('aborts a whole completion scan after 30 seconds', async () => {
    vi.useFakeTimers()
    mocks.getV1NamesForAddress.mockReturnValue(new Promise(() => {}))
    const pending = expect(
      fetchCommemorativeNftMigrationCompletion(params),
    ).rejects.toThrow('Request timed out')
    await vi.advanceTimersByTimeAsync(30_000)
    await pending
    expect(mocks.getV1NamesForAddress.mock.calls[0]?.[1].signal.aborted).toBe(
      true,
    )
    expect(mocks.runEligibilityChecks).not.toHaveBeenCalled()
  })

  it('cancels the active scan and ignores its late completion', async () => {
    let finish: ((value: unknown) => void) | undefined
    mocks.getV1NamesForAddress.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const controller = new AbortController()
    const pending = expect(
      fetchCommemorativeNftMigrationCompletion({
        ...params,
        signal: controller.signal,
      }),
    ).rejects.toThrow('Account changed')
    controller.abort(new Error('Account changed'))
    finish?.(ok([]))
    await pending
    expect(mocks.runEligibilityChecks).not.toHaveBeenCalled()
  })

  it('uses a compact evidence revision instead of serializing every completed operation into the query key', () => {
    const evidence = {
      ...verifiedMigration,
      revision: 2,
      completedOperations: Array.from({ length: 1000 }, (_, i) => ({
        name: `name${i}.eth`,
        action: 'migrate' as const,
      })),
    }
    const key = commemorativeNftMigrationCompletionQueryOptions({
      ...params,
      verifiedMigration: evidence,
    }).queryKey
    expect(JSON.stringify(key)).not.toContain('name999.eth')
    expect(JSON.stringify(key).length).toBeLessThan(600)
    expect(key).not.toEqual(
      commemorativeNftMigrationCompletionQueryOptions({
        ...params,
        verifiedMigration: { ...evidence, revision: 3 },
      }).queryKey,
    )
  })

  it('stops automatic reconciliation after six passes while remaining explicitly reconciling', async () => {
    vi.useFakeTimers()
    mocks.getMigratedNamesCount.mockResolvedValue(ok(0))
    const client = new QueryClient()
    const observer = new QueryObserver(
      client,
      commemorativeNftMigrationCompletionQueryOptions(params),
    )
    const unsubscribe = observer.subscribe(() => undefined)
    try {
      await vi.advanceTimersByTimeAsync(20_000)
      expect(mocks.getV1NamesForAddress).toHaveBeenCalledTimes(6)
      expect(observer.getCurrentResult().data?.status).toBe('reconciling')
      expect(observer.getCurrentResult().fetchStatus).toBe('idle')
      await observer.refetch()
      expect(mocks.getV1NamesForAddress).toHaveBeenCalledTimes(7)
    } finally {
      unsubscribe()
      client.clear()
    }
  })
})

it.each([
  0, 1, 1000, 2000,
])('checks %i names in one scan with two journal boundary reads', async (count) => {
  const domains = Array.from({ length: count }, (_, i) =>
    makeDomain({
      name: `name${i}.eth`,
      labelName: `name${i}`,
      id: namehash(`name${i}.eth`),
    }),
  )
  mocks.getV1NamesForAddress.mockResolvedValue(ok(domains))
  const getItem = vi.spyOn(localStorage, 'getItem')
  await fetchCommemorativeNftMigrationCompletion(params)
  expect(mocks.getV1NamesForAddress).toHaveBeenCalledOnce()
  expect(mocks.runEligibilityChecks).toHaveBeenCalledOnce()
  expect(mocks.runEligibilityChecks.mock.calls[0]?.[1]).toHaveLength(count)
  expect(getItem).toHaveBeenCalledTimes(2)
})
