import { i18n } from '@lingui/core'
import { useFeatureFlagEnabled } from '@posthog/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { Storage } from 'happy-dom'
import { createElement, type ReactNode } from 'react'
import type { Address } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChainId, useConfig } from 'wagmi'
import { useSmartAccountContext } from '@/lib/smart-account'
import { getCommemorativeNftContractAddress } from './config'
import {
  type CommemorativeNftClaimReceiptResult,
  claimCommemorativeNft,
  encodeCommemorativeNftClaim,
  readCommemorativeNftClaimed,
  waitForCommemorativeNftClaimReceipt,
} from './contract'
import { fetchCommemorativeNftEligibility } from './eligibility'
import { createCommemorativeNftPreviewEligibility } from './eligibility.fixture'
import {
  commemorativeNftMigrationCompletionQueryOptions,
  fetchCommemorativeNftMigrationCompletion,
} from './migrationCompletion'
import { readPendingNftClaim, savePendingNftClaim } from './pendingClaim'
import {
  commemorativeNftClaimedQueryOptions,
  commemorativeNftEligibilityQueryOptions,
} from './queries'
import type { CommemorativeNftEligibility } from './types'
import { useCommemorativeNftFlow } from './useCommemorativeNftFlow'
import {
  recordVerifiedNftMigration,
  type VerifiedNftMigration,
} from './verifiedMigration'

vi.mock('wagmi', () => ({ useChainId: vi.fn(), useConfig: vi.fn() }))
vi.mock('@posthog/react', () => ({ useFeatureFlagEnabled: vi.fn() }))
vi.mock('@/lib/smart-account', () => ({ useSmartAccountContext: vi.fn() }))
vi.mock('../service/userRegistryMigration', () => ({
  computeUserRegistryAddress: vi.fn(),
}))
vi.mock('./migrationCompletion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./migrationCompletion')>()
  const fetchCompletion = vi.fn()
  return {
    ...actual,
    fetchCommemorativeNftMigrationCompletion: fetchCompletion,
    commemorativeNftMigrationCompletionQueryOptions: (
      params: Parameters<
        typeof actual.commemorativeNftMigrationCompletionQueryOptions
      >[0],
    ) => ({
      ...actual.commemorativeNftMigrationCompletionQueryOptions(params),
      queryFn: () => fetchCompletion(params),
    }),
  }
})
vi.mock('./contract', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./contract')>()),
  claimCommemorativeNft: vi.fn(),
  readCommemorativeNftClaimed: vi.fn(),
  waitForCommemorativeNftClaimReceipt: vi.fn(),
}))
vi.mock('./eligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./eligibility')>()),
  fetchCommemorativeNftEligibility: vi.fn(),
}))

const ownerAddress: Address = '0x03Ba34f6Ea1496fa316873CF8350A3f7eaD317EF'
const transactionHash = `0x${'a'.repeat(64)}` as const
const confirmedReceipt: CommemorativeNftClaimReceiptResult = {
  status: 'confirmed',
  hash: transactionHash,
}
const hcaAddress = '0x1111111111111111111111111111111111111111'
const verifiedMigration: VerifiedNftMigration = {
  ownerAddress,
  hcaAddress,
  chainId: 11155111,
  completedOperations: [{ name: 'yoginth.eth', action: 'migrate' }],
}
const wagmiConfig = {} as ReturnType<typeof useConfig>
const eligibility: CommemorativeNftEligibility = {
  ...createCommemorativeNftPreviewEligibility({
    ownerAddress,
    profileName: 'yoginth.eth',
  }),
  source: 'static',
  proof: ['0x017995f95e79303c1853e326b15e6dcc16e6aa20f07372e4f0ab63c0b84f2631'],
  assets: {
    imageUrl: 'https://assets.example/art.webp',
    metadataUrl: 'https://assets.example/art.json',
  },
}
const readClaimed = vi.mocked(readCommemorativeNftClaimed)
const claim = vi.mocked(claimCommemorativeNft)
const waitForReceipt = vi.mocked(waitForCommemorativeNftClaimReceipt)
const fetchEligibility = vi.mocked(fetchCommemorativeNftEligibility)
const fetchCompletion = vi.mocked(fetchCommemorativeNftMigrationCompletion)
const completeMigration = {
  status: 'complete' as const,
  isComplete: true,
  remainingNameCount: 0,
  migratedNameCount: 5,
}
const partialMigration = {
  status: 'incomplete' as const,
  isComplete: false,
  remainingNameCount: 2,
  migratedNameCount: 3,
}
const featureFlag = vi.mocked(useFeatureFlagEnabled)
const clients: QueryClient[] = []

const createClient = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  return client
}

const claimQueryKey = commemorativeNftClaimedQueryOptions({
  ownerAddress,
  chainId: 11155111,
  wagmiConfig,
}).queryKey
const completionQueryKey = commemorativeNftMigrationCompletionQueryOptions({
  ownerAddress,
  hcaAddress,
  chainId: 11155111,
  wagmiConfig,
  journalRevision: 0,
}).queryKey

const mountFlow = (
  client: QueryClient,
  options: Partial<Parameters<typeof useCommemorativeNftFlow>[0]> = {},
) =>
  renderHook(
    () =>
      useCommemorativeNftFlow({
        open: true,
        ownerAddress,
        walletAddress: ownerAddress,
        ...options,
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    },
  )

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('commemorative NFT flow session', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    i18n.loadAndActivate({ locale: 'en', messages: {} })
    vi.stubGlobal('localStorage', new Storage())
    vi.stubGlobal('navigator', {
      ...navigator,
      locks: {
        request: async (
          _name: string,
          _options: LockOptions,
          callback: LockGrantedCallback<unknown>,
        ) => callback({ name: _name, mode: 'exclusive' }),
      },
    })
    vi.mocked(useChainId).mockReturnValue(11155111)
    vi.mocked(useConfig).mockReturnValue(wagmiConfig)
    featureFlag.mockReturnValue(true)
    vi.mocked(useSmartAccountContext, { partial: true }).mockReturnValue({
      ownerAddress,
      accountAddress: hcaAddress,
    })
    fetchCompletion.mockResolvedValue(completeMigration)
    fetchEligibility.mockResolvedValue({ status: 'eligible', eligibility })
    readClaimed.mockResolvedValue(false)
    claim.mockResolvedValue(transactionHash)
    waitForReceipt.mockResolvedValue(confirmedReceipt)
  })

  afterEach(() => {
    cleanup()
    for (const client of clients.splice(0)) client.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each([
    { migration: false, nft: true },
    { migration: true, nft: false },
    { migration: undefined, nft: true },
    { migration: true, nft: undefined },
  ])('keeps cached NFTs and callbacks disabled with flags $migration/$nft', async ({
    migration,
    nft,
  }) => {
    featureFlag.mockImplementation(
      (flag, defaultValue) =>
        (flag === 'migration' ? migration : nft) ?? defaultValue,
    )
    const client = createClient()
    client.setQueryData(
      commemorativeNftEligibilityQueryOptions({ ownerAddress }).queryKey,
      { status: 'eligible', eligibility },
    )
    client.setQueryData(claimQueryKey, false)
    const { result } = mountFlow(client)

    expect(result.current.admission.status).toBe('fallback')
    expect(result.current.eligibility).toBeUndefined()
    expect(result.current.state).not.toHaveProperty('card')
    expect(result.current.canMint).toBe(false)
    await act(async () => {
      result.current.mint()
      result.current.retry()
    })

    expect(fetchEligibility).not.toHaveBeenCalled()
    expect(readClaimed).not.toHaveBeenCalled()
    expect(claim).not.toHaveBeenCalled()
  })

  it('admits only after both initially unknown flags become enabled', async () => {
    featureFlag.mockImplementation((_flag, defaultValue) => defaultValue)
    const { result, rerender } = mountFlow(createClient())

    expect(result.current.admission.status).toBe('fallback')
    expect(fetchEligibility).not.toHaveBeenCalled()
    expect(readClaimed).not.toHaveBeenCalled()

    featureFlag.mockReturnValue(true)
    rerender()
    await waitFor(() => expect(result.current.canMint).toBe(true))
    expect(result.current.admission.status).toBe('admitted')
    expect(fetchEligibility).toHaveBeenCalledTimes(1)
    expect(readClaimed).toHaveBeenCalledTimes(1)
  })

  it('requires every eligible name to be migrated even with a published NFT proof', async () => {
    fetchCompletion.mockResolvedValue(partialMigration)
    const { result } = mountFlow(createClient())

    await waitFor(() => expect(result.current.state.status).toBe('ineligible'))
    expect(result.current.admission.status).toBe('fallback')
    expect(result.current.canMint).toBe(false)
    act(() => result.current.mint())
    expect(claim).not.toHaveBeenCalled()
  })

  it('admits a verified final migration despite a cached zero indexed count and keeps the evidence for mint later', async () => {
    const client = createClient()
    const zeroIndexedMigration = {
      status: 'reconciling' as const,
      isComplete: false,
      remainingNameCount: 0,
      migratedNameCount: 0,
    }
    client.setQueryData(completionQueryKey, zeroIndexedMigration)
    fetchCompletion.mockImplementation(
      async ({ verifiedMigration: evidence }) =>
        evidence ? completeMigration : zeroIndexedMigration,
    )
    const firstOpening = mountFlow(client)
    await waitFor(() =>
      expect(firstOpening.result.current.state.status).toBe('error'),
    )

    act(() =>
      recordVerifiedNftMigration({
        queryClient: client,
        evidence: verifiedMigration,
      }),
    )
    await waitFor(() => expect(firstOpening.result.current.canMint).toBe(true))
    expect(firstOpening.result.current.admission.status).toBe('admitted')
    firstOpening.unmount()

    const { result } = mountFlow(client)
    await waitFor(() => expect(result.current.canMint).toBe(true))
    act(() => result.current.mint())
    await waitFor(() => expect(claim).toHaveBeenCalledTimes(1))
    expect(fetchCompletion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        verifiedMigration: expect.objectContaining({
          ownerAddress: ownerAddress.toLowerCase(),
          hcaAddress,
          chainId: 11155111,
          completedOperations: verifiedMigration.completedOperations,
        }),
      }),
    )
  })

  it('does not admit cached completion until the current opening verifies it', async () => {
    const pending =
      deferred<
        Awaited<ReturnType<typeof fetchCommemorativeNftMigrationCompletion>>
      >()
    fetchCompletion.mockReturnValueOnce(pending.promise)
    const client = createClient()
    client.setQueryData(completionQueryKey, completeMigration)
    const { result } = mountFlow(client)

    await waitFor(() => expect(client.getQueryData(claimQueryKey)).toBe(false))
    expect(result.current.admission.status).toBe('checking')
    expect(result.current.canMint).toBe(false)

    await act(async () => pending.resolve(completeMigration))
    await waitFor(() => expect(result.current.canMint).toBe(true))
  })

  it('keeps admitted artwork during revalidation but revokes minting when names remain', async () => {
    const client = createClient()
    const { result } = mountFlow(client)
    await waitFor(() => expect(result.current.canMint).toBe(true))
    const retainedMint = result.current.mint
    const pending =
      deferred<
        Awaited<ReturnType<typeof fetchCommemorativeNftMigrationCompletion>>
      >()
    fetchCompletion.mockReturnValueOnce(pending.promise)
    let invalidation!: Promise<void>
    act(() => {
      invalidation = client.invalidateQueries({ queryKey: completionQueryKey })
    })
    await waitFor(() => expect(result.current.canMint).toBe(false))
    expect(result.current.state.status).toBe('readyToMint')

    await act(async () => {
      pending.resolve(partialMigration)
      await invalidation
    })
    await waitFor(() => expect(result.current.state.status).toBe('ineligible'))
    fetchCompletion.mockResolvedValue(partialMigration)
    act(() => retainedMint())
    await waitFor(() => expect(client.isMutating()).toBe(0))
    expect(claim).not.toHaveBeenCalled()
  })

  it('requires a successful completion check and supports retry after failure', async () => {
    fetchCompletion.mockRejectedValueOnce(new Error('Migration check failed'))
    const { result } = mountFlow(createClient())

    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.canMint).toBe(false)
    expect(result.current.state).toMatchObject({ stage: 'eligibility' })
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.canMint).toBe(true))
  })

  it('rechecks completion before submission and refuses newly remaining names', async () => {
    fetchCompletion
      .mockResolvedValueOnce(completeMigration)
      .mockResolvedValue(partialMigration)
    const client = createClient()
    const { result } = mountFlow(client)
    await waitFor(() => expect(result.current.canMint).toBe(true))

    act(() => result.current.mint())
    await waitFor(() => expect(fetchCompletion).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(client.isMutating()).toBe(0))
    expect(claim).not.toHaveBeenCalled()
    expect(waitForReceipt).not.toHaveBeenCalled()
    expect(result.current.canMint).toBe(false)
  })

  it('blocks submission if the feature is disabled during the final completion check', async () => {
    const pending =
      deferred<
        Awaited<ReturnType<typeof fetchCommemorativeNftMigrationCompletion>>
      >()
    fetchCompletion
      .mockResolvedValueOnce(completeMigration)
      .mockReturnValueOnce(pending.promise)
    const client = createClient()
    const { result, rerender } = mountFlow(client)
    await waitFor(() => expect(result.current.canMint).toBe(true))
    act(() => result.current.mint())
    await waitFor(() => expect(fetchCompletion).toHaveBeenCalledTimes(2))
    featureFlag.mockReturnValue(false)
    rerender()

    await act(async () => pending.resolve(completeMigration))
    await waitFor(() => expect(client.isMutating()).toBe(0))
    expect(claim).not.toHaveBeenCalled()
  })

  it('rejects an in-flight completion result after the migration account disappears', async () => {
    const pending =
      deferred<
        Awaited<ReturnType<typeof fetchCommemorativeNftMigrationCompletion>>
      >()
    fetchCompletion
      .mockResolvedValueOnce(completeMigration)
      .mockReturnValueOnce(pending.promise)
    const client = createClient()
    const { result, rerender } = mountFlow(client)
    await waitFor(() => expect(result.current.canMint).toBe(true))
    const retainedMint = result.current.mint
    act(() => result.current.mint())
    await waitFor(() => expect(fetchCompletion).toHaveBeenCalledTimes(2))
    vi.mocked(useSmartAccountContext, { partial: true }).mockReturnValue({
      ownerAddress,
      accountAddress: null,
    })
    rerender()

    await act(async () => pending.resolve(completeMigration))
    await waitFor(() => expect(client.isMutating()).toBe(0))
    expect(claim).not.toHaveBeenCalled()
    act(() => retainedMint())
    await waitFor(() => expect(client.isMutating()).toBe(0))
    expect(fetchCompletion).toHaveBeenCalledTimes(2)
    expect(claim).not.toHaveBeenCalled()
  })

  it('keeps tracking a submitted claim if a later completion check fails', async () => {
    const pendingReceipt = deferred<CommemorativeNftClaimReceiptResult>()
    waitForReceipt.mockReturnValueOnce(pendingReceipt.promise)
    const client = createClient()
    const { result } = mountFlow(client)
    await waitFor(() => expect(result.current.canMint).toBe(true))
    act(() => result.current.mint())
    await waitFor(() => expect(waitForReceipt).toHaveBeenCalledTimes(1))

    fetchCompletion.mockRejectedValueOnce(new Error('Migration RPC failed'))
    await act(async () =>
      client.invalidateQueries({ queryKey: completionQueryKey }),
    )
    expect(result.current.state.status).toBe('minting')
    expect(result.current.canMint).toBe(false)

    readClaimed.mockResolvedValue(true)
    await act(async () => pendingReceipt.resolve(confirmedReceipt))
    await waitFor(() => expect(result.current.state.status).toBe('minted'))
    expect(result.current.admission.status).toBe('admitted')
    expect(claim).toHaveBeenCalledTimes(1)
  })

  it('revokes an admitted flow and retained callbacks when the flag turns off', async () => {
    const { result, rerender } = mountFlow(createClient())
    await waitFor(() => expect(result.current.canMint).toBe(true))
    const retainedMint = result.current.mint
    const retainedRetry = result.current.retry
    const eligibilityReadCount = fetchEligibility.mock.calls.length
    const claimReadCount = readClaimed.mock.calls.length

    featureFlag.mockReturnValue(false)
    rerender()

    expect(result.current.admission.status).toBe('fallback')
    expect(result.current.eligibility).toBeUndefined()
    expect(result.current.state).not.toHaveProperty('card')
    expect(result.current.canMint).toBe(false)
    await act(async () => {
      result.current.mint()
      result.current.retry()
      retainedMint()
      retainedRetry()
    })

    expect(fetchEligibility).toHaveBeenCalledTimes(eligibilityReadCount)
    expect(readClaimed).toHaveBeenCalledTimes(claimReadCount)
    expect(claim).not.toHaveBeenCalled()
  })

  it('finishes an already submitted receipt after the flag is disabled', async () => {
    const pendingReceipt = deferred<CommemorativeNftClaimReceiptResult>()
    waitForReceipt.mockReturnValueOnce(pendingReceipt.promise)
    const client = createClient()
    const { result, rerender } = mountFlow(client)
    await waitFor(() => expect(result.current.canMint).toBe(true))
    act(() => result.current.mint())
    await waitFor(() => expect(result.current.state.status).toBe('minting'))
    await waitFor(() => expect(waitForReceipt).toHaveBeenCalledTimes(1))

    featureFlag.mockReturnValue(false)
    rerender()
    const claimReadCount = readClaimed.mock.calls.length
    expect(result.current.admission.status).toBe('fallback')
    expect(result.current.state).not.toHaveProperty('card')
    expect(result.current.canMint).toBe(false)

    await act(async () => pendingReceipt.resolve(confirmedReceipt))
    await waitFor(() => expect(client.isMutating()).toBe(0))
    expect(client.getMutationCache().getAll()[0]?.state.status).toBe('success')
    expect(claim).toHaveBeenCalledTimes(1)
    expect(readClaimed).toHaveBeenCalledTimes(claimReadCount)
    expect(result.current.admission.status).toBe('fallback')
  })

  it('blocks a queued mutation if the flag turns off before submission', async () => {
    const client = createClient()
    const { result, rerender } = mountFlow(client)
    await waitFor(() => expect(result.current.canMint).toBe(true))

    act(() => {
      result.current.mint()
      featureFlag.mockReturnValue(false)
      rerender()
    })
    await waitFor(() => expect(client.isMutating()).toBe(0))

    expect(client.getMutationCache().getAll()[0]?.state.status).toBe('error')
    expect(result.current.admission.status).toBe('fallback')
    expect(claim).not.toHaveBeenCalled()
    expect(waitForReceipt).not.toHaveBeenCalled()
  })

  it('uses one observer read to admit a cached-false opening, even in the same millisecond', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(100)
    const pendingRead = deferred<boolean>()
    readClaimed.mockReturnValueOnce(pendingRead.promise)
    const client = createClient()
    client.setQueryData(claimQueryKey, false)
    const { result } = mountFlow(client)

    expect(result.current.admission.status).toBe('checking')
    expect(result.current.canMint).toBe(false)
    await act(async () => pendingRead.resolve(false))
    await waitFor(() =>
      expect(result.current.admission.status).toBe('admitted'),
    )

    expect(readClaimed).toHaveBeenCalledTimes(1)
    expect(result.current.state.status).toBe('readyToMint')
    expect(result.current.canMint).toBe(true)
  })

  it('suppresses cached true immediately, without waiting for eligibility', () => {
    fetchEligibility.mockReturnValueOnce(deferred<never>().promise)
    readClaimed.mockReturnValueOnce(deferred<boolean>().promise)
    const client = createClient()
    client.setQueryData(claimQueryKey, true)
    const { result } = mountFlow(client)

    expect(result.current.admission.status).toBe('alreadyMinted')
    expect(result.current.canMint).toBe(false)
    act(() => result.current.mint())
    expect(claim).not.toHaveBeenCalled()
  })

  it('waits for current metadata validation even when cached eligibility and a fresh claim read permit minting', async () => {
    const pendingEligibility =
      deferred<Awaited<ReturnType<typeof fetchCommemorativeNftEligibility>>>()
    fetchEligibility.mockReturnValueOnce(pendingEligibility.promise)
    const client = createClient()
    client.setQueryData(
      commemorativeNftEligibilityQueryOptions({ ownerAddress }).queryKey,
      { status: 'eligible', eligibility },
    )
    const { result } = mountFlow(client)
    await waitFor(() => expect(client.getQueryData(claimQueryKey)).toBe(false))

    expect(result.current.admission.status).toBe('checking')
    expect(result.current.canMint).toBe(false)
    act(() => result.current.mint())
    expect(claim).not.toHaveBeenCalled()

    await act(async () =>
      pendingEligibility.resolve({ status: 'eligible', eligibility }),
    )
    await waitFor(() => expect(result.current.canMint).toBe(true))
    expect(result.current.admission.status).toBe('admitted')
  })

  it('disables minting during metadata revalidation and keeps it blocked when the JSON is gone', async () => {
    const client = createClient()
    const { result } = mountFlow(client)
    await waitFor(() => expect(result.current.canMint).toBe(true))
    const pendingEligibility =
      deferred<Awaited<ReturnType<typeof fetchCommemorativeNftEligibility>>>()
    fetchEligibility.mockReturnValueOnce(pendingEligibility.promise)
    let invalidation!: Promise<void>
    act(() => {
      invalidation = client.invalidateQueries({
        queryKey: commemorativeNftEligibilityQueryOptions({ ownerAddress })
          .queryKey,
      })
    })
    await waitFor(() => expect(result.current.canMint).toBe(false))

    expect(result.current.admission.status).toBe('admitted')
    act(() => result.current.mint())
    expect(claim).not.toHaveBeenCalled()

    await act(async () => {
      pendingEligibility.resolve({ status: 'ineligible' })
      await invalidation
    })
    await waitFor(() => expect(result.current.state.status).toBe('ineligible'))
    expect(result.current.admission.status).toBe('fallback')
    expect(result.current.canMint).toBe(false)

    fetchEligibility.mockRejectedValueOnce(new Error('HTTP 503'))
    await act(async () =>
      client.invalidateQueries({
        queryKey: commemorativeNftEligibilityQueryOptions({ ownerAddress })
          .queryKey,
      }),
    )
    expect(result.current.state.status).toBe('ineligible')
    expect(result.current.admission.status).toBe('fallback')
    expect(result.current.canMint).toBe(false)
    act(() => result.current.mint())
    expect(claim).not.toHaveBeenCalled()
  })

  it('keeps retry available when eligible metadata fails to refetch', async () => {
    const client = createClient()
    const { result } = mountFlow(client)
    await waitFor(() => expect(result.current.canMint).toBe(true))

    fetchEligibility.mockRejectedValueOnce(new Error('HTTP 503'))
    await act(async () =>
      client.invalidateQueries({
        queryKey: commemorativeNftEligibilityQueryOptions({ ownerAddress })
          .queryKey,
      }),
    )
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.admission.status).toBe('admitted')
    expect(result.current.state).toMatchObject({
      status: 'error',
      stage: 'eligibility',
    })
    expect(result.current.canMint).toBe(false)

    act(() => result.current.retry())
    await waitFor(() => expect(result.current.canMint).toBe(true))
  })

  it('is ready to mint without waiting for an artwork renderer callback', async () => {
    const { result } = mountFlow(createClient())

    await waitFor(() =>
      expect(result.current.admission.status).toBe('admitted'),
    )
    expect(result.current.state.status).toBe('readyToMint')
    expect(result.current.canMint).toBe(true)
  })

  it('prevents claiming when published metadata is missing', async () => {
    fetchEligibility.mockResolvedValueOnce({ status: 'ineligible' })
    const { result } = mountFlow(createClient())

    await waitFor(() =>
      expect(result.current.admission.status).toBe('fallback'),
    )

    expect(result.current.eligibility).toBeUndefined()
    expect(result.current.state.status).toBe('ineligible')
    expect(result.current.canMint).toBe(false)
    act(() => result.current.mint())
    expect(claim).not.toHaveBeenCalled()
  })

  it.each([
    'ineligible',
    'unavailable',
  ] as const)('does not substitute sample artwork when published metadata is %s', async (status) => {
    fetchEligibility.mockResolvedValueOnce({ status })
    const { result } = mountFlow(createClient())

    await waitFor(() =>
      expect(result.current.state.status).toBe(
        status === 'ineligible' ? 'ineligible' : 'error',
      ),
    )

    expect(result.current.eligibility).toBeUndefined()
    expect(result.current.state).not.toHaveProperty('card')
    expect(result.current.canMint).toBe(false)
  })

  it('shows a safe metadata error without substituting sample artwork', async () => {
    fetchEligibility.mockRejectedValueOnce(
      new Error('Published metadata unavailable'),
    )
    const { result } = mountFlow(createClient())

    await waitFor(() => expect(result.current.state.status).toBe('error'))

    expect(result.current.state).toEqual({
      status: 'error',
      stage: 'eligibility',
      message: 'Eligibility could not be loaded. Please try again.',
    })
    expect(result.current.eligibility).toBeUndefined()
    expect(result.current.canMint).toBe(false)
  })

  it('rejects sample eligibility returned from a previous fixture source', async () => {
    fetchEligibility.mockResolvedValueOnce({
      status: 'eligible',
      eligibility: createCommemorativeNftPreviewEligibility({ ownerAddress }),
    })
    const { result } = mountFlow(createClient())

    await waitFor(() => expect(result.current.state.status).toBe('error'))

    expect(result.current.eligibility).toBeUndefined()
    expect(result.current.state).not.toHaveProperty('card')
    expect(result.current.canMint).toBe(false)
    act(() => result.current.mint())
    expect(claim).not.toHaveBeenCalled()
  })

  it('retains this opening after a confirmed mint and suppresses the next opening', async () => {
    const pendingReceipt = deferred<CommemorativeNftClaimReceiptResult>()
    waitForReceipt.mockReturnValueOnce(pendingReceipt.promise)
    const client = createClient()
    const flow = mountFlow(client)
    await waitFor(() =>
      expect(flow.result.current.admission.status).toBe('admitted'),
    )
    act(() => {
      flow.result.current.mint()
      flow.result.current.mint()
    })
    await waitFor(() =>
      expect(flow.result.current.state.status).toBe('minting'),
    )
    expect(claim).toHaveBeenCalledTimes(1)
    expect(flow.result.current.canMint).toBe(false)

    readClaimed.mockResolvedValue(true)
    await act(async () => pendingReceipt.resolve(confirmedReceipt))
    await waitFor(() => expect(flow.result.current.state.status).toBe('minted'))
    expect(flow.result.current.admission.status).toBe('admitted')

    flow.unmount()
    const reopened = mountFlow(client)
    expect(reopened.result.current.admission.status).toBe('alreadyMinted')
  })

  it('keeps a failed initial read outside the modal and supports retry', async () => {
    readClaimed.mockRejectedValueOnce(new Error('RPC unavailable'))
    const { result } = mountFlow(createClient())

    await waitFor(() =>
      expect(result.current.admission).toEqual({
        status: 'unavailable',
        reason: 'claimReadFailed',
      }),
    )
    expect(result.current.canMint).toBe(false)
    act(() => result.current.retry())
    await waitFor(() =>
      expect(result.current.admission.status).toBe('admitted'),
    )
    expect(result.current.state.status).toBe('readyToMint')
    expect(result.current.canMint).toBe(true)
  })

  it('prevents another claim when the same owner reopens during a pending receipt', async () => {
    const pendingReceipt = deferred<CommemorativeNftClaimReceiptResult>()
    waitForReceipt.mockReturnValueOnce(pendingReceipt.promise)
    const client = createClient()
    const first = mountFlow(client)
    await waitFor(() =>
      expect(first.result.current.admission.status).toBe('admitted'),
    )
    act(() => first.result.current.mint())
    await waitFor(() =>
      expect(first.result.current.state.status).toBe('minting'),
    )
    first.unmount()

    const reopened = mountFlow(client)
    await waitFor(() =>
      expect(reopened.result.current.admission.status).toBe('admitted'),
    )
    act(() => reopened.result.current.mint())
    expect(reopened.result.current.state.status).toBe('claimPending')
    expect(reopened.result.current.canMint).toBe(false)
    expect(claim).toHaveBeenCalledTimes(1)

    readClaimed.mockResolvedValue(true)
    await act(async () => pendingReceipt.resolve(confirmedReceipt))
    await waitFor(() =>
      expect(reopened.result.current.state.status).toBe('minted'),
    )
    expect(reopened.result.current.admission.status).toBe('admitted')
  })

  it('records wallet rejection without returning an unhandled rejected promise', async () => {
    claim.mockRejectedValueOnce(new Error('UserRejectedRequestError'))
    const { result } = mountFlow(createClient())
    await waitFor(() =>
      expect(result.current.admission.status).toBe('admitted'),
    )
    act(() => expect(result.current.mint()).toBeUndefined())

    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.admission.status).toBe('admitted')
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.canMint).toBe(true))
  })

  it('can check an unknown receipt outcome without allowing another mint', async () => {
    waitForReceipt.mockResolvedValueOnce({
      status: 'pending',
      hash: transactionHash,
    })
    const { result } = mountFlow(createClient())
    await waitFor(() => expect(result.current.canMint).toBe(true))
    act(() => result.current.mint())
    await waitFor(() =>
      expect(result.current.state.status).toBe('claimPending'),
    )
    expect(result.current.canMint).toBe(false)
    expect(result.current.canCheckStatus).toBe(true)
    act(() => {
      result.current.mint()
      result.current.checkStatus()
    })
    await waitFor(() => expect(result.current.state.status).toBe('minted'))
    expect(claim).toHaveBeenCalledTimes(1)
    expect(waitForReceipt).toHaveBeenCalledTimes(2)
  })

  it('restores a submitted claim with a fresh query cache when migration indexing is unavailable', async () => {
    const contractAddress = getCommemorativeNftContractAddress(11155111)
    if (!contractAddress) throw new Error('Missing test contract')
    const saved = {
      version: 1 as const,
      chainId: 11155111,
      ownerAddress,
      contractAddress,
      hash: transactionHash,
      expectedClaimData: encodeCommemorativeNftClaim(eligibility.proof),
      submittedAt: Date.now(),
    }
    savePendingNftClaim(saved)
    fetchCompletion.mockRejectedValue(new Error('Indexer unavailable'))
    waitForReceipt.mockResolvedValue({
      status: 'pending',
      hash: transactionHash,
    })
    const { result, unmount } = mountFlow(createClient())
    await waitFor(() => expect(result.current.canCheckStatus).toBe(true))
    expect(result.current.admission.status).toBe('admitted')
    expect(result.current.state.status).toBe('claimPending')
    expect(result.current.canMint).toBe(false)
    act(() => result.current.mint())
    expect(claim).not.toHaveBeenCalled()
    expect(fetchCompletion).not.toHaveBeenCalled()
    expect(readPendingNftClaim(saved).claim).toEqual(saved)
    unmount()
    const reopened = mountFlow(createClient())
    await waitFor(() => expect(waitForReceipt).toHaveBeenCalledTimes(2))
    expect(reopened.result.current.canMint).toBe(false)
  })

  it('saves replacement hashes and checks them without submitting another mint', async () => {
    const replacementHash = `0x${'b'.repeat(64)}` as const
    waitForReceipt.mockImplementationOnce(async ({ onReplaced }) => {
      onReplaced?.(replacementHash)
      return { status: 'pending', hash: replacementHash }
    })
    const { result } = mountFlow(createClient())
    await waitFor(() => expect(result.current.canMint).toBe(true))
    act(() => result.current.mint())
    await waitFor(() => expect(result.current.canCheckStatus).toBe(true))
    expect(result.current.state).toMatchObject({
      status: 'claimPending',
      txHash: replacementHash,
    })
    waitForReceipt.mockResolvedValueOnce({
      status: 'confirmed',
      hash: replacementHash,
    })
    act(() => result.current.checkStatus())
    await waitFor(() => expect(result.current.state.status).toBe('minted'))
    expect(waitForReceipt).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pendingClaim: expect.objectContaining({ hash: replacementHash }),
      }),
    )
    expect(claim).toHaveBeenCalledTimes(1)
  })

  it.each([
    'cancelled',
    'replaced',
    'reverted',
  ] as const)('clears a proven %s outcome and permits a fresh attempt only after retry', async (status) => {
    waitForReceipt.mockResolvedValueOnce({ status, hash: transactionHash })
    const { result } = mountFlow(createClient())
    await waitFor(() => expect(result.current.canMint).toBe(true))
    act(() => result.current.mint())
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.canMint).toBe(false)
    expect(result.current.canCheckStatus).toBe(false)
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.canMint).toBe(true))
    expect(claim).toHaveBeenCalledTimes(1)
  })

  it('does not open the wallet if a pending hash cannot be saved durably', async () => {
    const { result } = mountFlow(createClient())
    await waitFor(() => expect(result.current.canMint).toBe(true))
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage full')
    })
    act(() => result.current.mint())
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.state).toMatchObject({
      stage: 'claim',
      message:
        'Mint recovery could not be saved in this browser. Allow site storage and try again.',
    })
    expect(claim).not.toHaveBeenCalled()
  })

  it('does not restore a pending claim from another owner or network', async () => {
    const contractAddress = getCommemorativeNftContractAddress(11155111)
    if (!contractAddress) throw new Error('Missing test contract')
    savePendingNftClaim({
      version: 1,
      chainId: 11155111,
      ownerAddress,
      contractAddress,
      hash: transactionHash,
      expectedClaimData: encodeCommemorativeNftClaim(eligibility.proof),
      submittedAt: Date.now(),
    })
    const otherOwner = '0x1111111111111111111111111111111111111111'
    const other = mountFlow(createClient(), {
      ownerAddress: otherOwner,
      walletAddress: otherOwner,
    })
    await waitFor(() =>
      expect(other.result.current.admission.status).toBe('fallback'),
    )
    other.unmount()
    vi.mocked(useChainId).mockReturnValue(1)
    const otherNetwork = mountFlow(createClient())
    expect(otherNetwork.result.current.canMint).toBe(false)
    expect(waitForReceipt).not.toHaveBeenCalled()
    expect(claim).not.toHaveBeenCalled()
  })

  it('blocks submission when the migration account changes during the final claimed read', async () => {
    const client = createClient()
    const { result, rerender } = mountFlow(client)
    await waitFor(() => expect(result.current.canMint).toBe(true))
    const finalRead = deferred<boolean>()
    readClaimed.mockReturnValueOnce(finalRead.promise)
    act(() => result.current.mint())
    await waitFor(() => expect(readClaimed).toHaveBeenCalledTimes(2))
    vi.mocked(useSmartAccountContext, { partial: true }).mockReturnValue({
      ownerAddress,
      accountAddress: '0x2222222222222222222222222222222222222222',
    })
    rerender()
    await act(async () => finalRead.resolve(false))
    await waitFor(() => expect(client.isMutating()).toBe(0))
    expect(claim).not.toHaveBeenCalled()
  })

  it('ignores an older unclaimed read that resolves after receipt verification', async () => {
    const receipt = deferred<CommemorativeNftClaimReceiptResult>()
    waitForReceipt.mockReturnValueOnce(receipt.promise)
    const client = createClient()
    const { result } = mountFlow(client)
    await waitFor(() => expect(result.current.canMint).toBe(true))
    act(() => result.current.mint())
    await waitFor(() => expect(waitForReceipt).toHaveBeenCalledTimes(1))
    const earlierClaimedRead = deferred<boolean>()
    readClaimed.mockReturnValueOnce(earlierClaimedRead.promise)
    act(() => {
      void client.refetchQueries({ queryKey: claimQueryKey, exact: true })
    })
    await act(async () => receipt.resolve(confirmedReceipt))
    await waitFor(() => expect(result.current.state.status).toBe('minted'))
    await act(async () => earlierClaimedRead.resolve(false))
    expect(client.getQueryData(claimQueryKey)).toBe(true)
    expect(result.current.canMint).toBe(false)
    expect(claim).toHaveBeenCalledTimes(1)
  })

  it('shows recovery storage failure in the admitted shell without sending or polling', async () => {
    const contractAddress = getCommemorativeNftContractAddress(11155111)
    if (!contractAddress) throw new Error('Missing test contract')
    savePendingNftClaim({
      version: 1,
      chainId: 11155111,
      ownerAddress,
      contractAddress,
      hash: transactionHash,
      expectedClaimData: encodeCommemorativeNftClaim(eligibility.proof),
      submittedAt: Date.now(),
    })
    const key = localStorage.key(0)
    if (!key) throw new Error('Missing pending claim key')
    const storage = new Storage()
    storage.setItem(key, '{corrupt')
    vi.stubGlobal('localStorage', storage)
    const { result } = mountFlow(createClient())
    expect(result.current.admission.status).toBe('admitted')
    expect(result.current.state).toMatchObject({
      status: 'error',
      stage: 'claim',
    })
    expect(result.current.canMint).toBe(false)
    expect(result.current.canCheckStatus).toBe(false)
    act(() => result.current.mint())
    expect(claim).not.toHaveBeenCalled()
    expect(waitForReceipt).not.toHaveBeenCalled()
  })

  it('does not wait forever for a disabled query when the owner is missing', () => {
    const { result } = mountFlow(createClient(), { ownerAddress: undefined })

    expect(result.current.admission).toEqual({
      status: 'unavailable',
      reason: 'ownerMissing',
    })
    expect(readClaimed).not.toHaveBeenCalled()
    expect(result.current.canMint).toBe(false)
  })

  it.each([
    undefined,
    '0x538cDec1cb3e7A874D473E36558F535Ba2343B83',
  ] as const)('prevents minting with a disconnected or different wallet: %s', async (walletAddress) => {
    const { result } = mountFlow(createClient(), { walletAddress })
    await waitFor(() =>
      expect(result.current.admission.status).toBe('admitted'),
    )
    act(() => result.current.mint())

    expect(result.current.canMint).toBe(false)
    expect(claim).not.toHaveBeenCalled()
  })
})
