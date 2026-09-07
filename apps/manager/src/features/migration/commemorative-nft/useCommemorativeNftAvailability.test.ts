import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { type Address, zeroAddress } from 'viem'
import { mainnet, sepolia } from 'viem/chains'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChainId, useConfig } from 'wagmi'
import {
  buildCommemorativeNftAssets,
  getCommemorativeNftConfig,
} from './config'
import { readCommemorativeNftClaimed } from './contract'
import { fetchCommemorativeNftEligibility } from './eligibility'
import { createCommemorativeNftPreviewEligibility } from './eligibility.fixture'
import {
  commemorativeNftClaimedQueryOptions,
  invalidateCommemorativeNftStatus,
} from './queries'
import type { CommemorativeNftEligibilityResult } from './types'
import { useCommemorativeNftAvailability } from './useCommemorativeNftAvailability'

vi.mock('wagmi', () => ({ useChainId: vi.fn(), useConfig: vi.fn() }))
vi.mock('./contract', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./contract')>()),
  readCommemorativeNftClaimed: vi.fn(),
}))
vi.mock('./eligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./eligibility')>()),
  fetchCommemorativeNftEligibility: vi.fn(),
}))

type AvailabilityParams = Parameters<typeof useCommemorativeNftAvailability>[0]

const ownerAddress = '0x03Ba34f6Ea1496fa316873CF8350A3f7eaD317EF'
const otherOwnerAddress = '0x0000000000000000000000000000000000000001'
const wagmiConfig = {} as ReturnType<typeof useConfig>
const readClaimed = vi.mocked(readCommemorativeNftClaimed)
const fetchEligibility = vi.mocked(fetchCommemorativeNftEligibility)
const clients: QueryClient[] = []

const createClient = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  return client
}

const claimQueryKey = (
  params: { readonly ownerAddress?: Address; readonly chainId?: number } = {},
) =>
  commemorativeNftClaimedQueryOptions({
    ownerAddress: params.ownerAddress ?? ownerAddress,
    chainId: params.chainId ?? sepolia.id,
    wagmiConfig,
  }).queryKey

const mountAvailability = (
  client: QueryClient,
  options: Partial<AvailabilityParams> = {},
) =>
  renderHook(
    (params: AvailabilityParams) => useCommemorativeNftAvailability(params),
    {
      initialProps: { ownerAddress, enabled: true, ...options },
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

describe('commemorative NFT availability observer', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    onlineManager.setOnline(true)
    vi.mocked(useChainId).mockReturnValue(sepolia.id)
    vi.mocked(useConfig).mockReturnValue(wagmiConfig)
    fetchEligibility.mockImplementation(async (params) => ({
      status: 'eligible',
      eligibility: {
        ...createCommemorativeNftPreviewEligibility({
          ownerAddress: params.ownerAddress,
        }),
        source: 'static',
      },
    }))
    readClaimed.mockResolvedValue(false)
  })

  afterEach(() => {
    cleanup()
    for (const client of clients.splice(0)) client.clear()
    onlineManager.setOnline(true)
    vi.restoreAllMocks()
  })

  it('exposes cached minted status immediately and confirms it after refetch', async () => {
    const pendingRead = deferred<boolean>()
    readClaimed.mockReturnValueOnce(pendingRead.promise)
    const client = createClient()
    client.setQueryData(claimQueryKey(), true)
    const { result } = mountAvailability(client)

    expect(result.current.claimed.data).toBe(true)
    expect(result.current.claimed.fetchStatus).toBe('fetching')
    expect(result.current.hasFreshClaimedResult).toBe(false)
    expect(result.current.isConfirmedUnclaimed).toBe(false)

    await act(async () => pendingRead.resolve(true))
    await waitFor(() => expect(result.current.hasFreshClaimedResult).toBe(true))

    expect(result.current.claimed.data).toBe(true)
    expect(result.current.isConfirmedUnclaimed).toBe(false)
    expect(readClaimed).toHaveBeenCalledTimes(1)
  })

  it('waits for this observer to successfully refetch cached unclaimed status', async () => {
    const pendingRead = deferred<boolean>()
    readClaimed.mockReturnValueOnce(pendingRead.promise)
    const client = createClient()
    client.setQueryData(claimQueryKey(), false)
    const { result } = mountAvailability(client)

    expect(result.current.claimed.data).toBe(false)
    expect(result.current.hasFreshClaimedResult).toBe(false)
    expect(result.current.isConfirmedUnclaimed).toBe(false)

    await act(async () => pendingRead.resolve(false))
    await waitFor(() => expect(result.current.isConfirmedUnclaimed).toBe(true))

    expect(result.current.hasFreshClaimedResult).toBe(true)
    expect(readClaimed).toHaveBeenCalledTimes(1)
  })

  it.each([
    undefined,
    false,
  ])('does not confirm unclaimed status after a failed read with cached value %s', async (cachedClaimed) => {
    readClaimed.mockRejectedValueOnce(new Error('RPC unavailable'))
    const client = createClient()
    if (cachedClaimed !== undefined)
      client.setQueryData(claimQueryKey(), cachedClaimed)
    const { result } = mountAvailability(client)

    await waitFor(() => expect(result.current.claimed.isError).toBe(true))

    expect(result.current.claimed.data).toBe(cachedClaimed)
    expect(result.current.hasFreshClaimedResult).toBe(false)
    expect(result.current.isConfirmedUnclaimed).toBe(false)
  })

  it.each([
    undefined,
    false,
  ])('waits for an online read before confirming cached value %s', async (cachedClaimed) => {
    onlineManager.setOnline(false)
    const client = createClient()
    if (cachedClaimed !== undefined)
      client.setQueryData(claimQueryKey(), cachedClaimed)
    const { result } = mountAvailability(client)

    expect(result.current.claimed.fetchStatus).toBe('paused')
    expect(result.current.hasFreshClaimedResult).toBe(false)
    expect(result.current.isConfirmedUnclaimed).toBe(false)
    expect(readClaimed).not.toHaveBeenCalled()

    act(() => onlineManager.setOnline(true))
    await waitFor(() => expect(result.current.isConfirmedUnclaimed).toBe(true))
    expect(readClaimed).toHaveBeenCalledTimes(1)
  })

  it.each([
    {
      name: 'unsupported network',
      chainId: mainnet.id,
      ownerAddress,
      enabled: true,
    },
    {
      name: 'disconnected wallet',
      chainId: sepolia.id,
      ownerAddress,
      enabled: false,
    },
    {
      name: 'missing owner',
      chainId: sepolia.id,
      ownerAddress: undefined,
      enabled: true,
    },
  ] as const)('keeps $name gated even with cached unclaimed status', (params) => {
    vi.mocked(useChainId).mockReturnValue(params.chainId)
    const client = createClient()
    client.setQueryData(
      claimQueryKey({
        ownerAddress: params.ownerAddress ?? zeroAddress,
        chainId: params.chainId,
      }),
      false,
    )
    const { result } = mountAvailability(client, {
      ownerAddress: params.ownerAddress,
      enabled: params.enabled,
    })

    expect(result.current.claimed.data).toBe(false)
    expect(result.current.claimed.fetchStatus).toBe('idle')
    expect(result.current.hasFreshClaimedResult).toBe(false)
    expect(result.current.isConfirmedUnclaimed).toBe(false)
    expect(readClaimed).not.toHaveBeenCalled()
    expect(fetchEligibility).not.toHaveBeenCalled()
  })

  it('revokes confirmed availability when the connected wallet is disabled', async () => {
    const { result, rerender } = mountAvailability(createClient())
    await waitFor(() => expect(result.current.isConfirmedUnclaimed).toBe(true))

    rerender({ ownerAddress, enabled: false })

    expect(result.current.claimed.data).toBe(false)
    expect(result.current.claimed.isFetchedAfterMount).toBe(true)
    expect(result.current.hasFreshClaimedResult).toBe(false)
    expect(result.current.isConfirmedUnclaimed).toBe(false)
    expect(readClaimed).toHaveBeenCalledTimes(1)
  })

  it('ignores an old wallet read that completes after switching owners', async () => {
    const oldOwnerRead = deferred<boolean>()
    const newOwnerRead = deferred<boolean>()
    readClaimed
      .mockReturnValueOnce(oldOwnerRead.promise)
      .mockReturnValueOnce(newOwnerRead.promise)
    const client = createClient()
    const { result, rerender } = mountAvailability(client)

    rerender({ ownerAddress: otherOwnerAddress, enabled: true })
    await act(async () => oldOwnerRead.resolve(false))

    expect(result.current.claimed.data).toBeUndefined()
    expect(result.current.isConfirmedUnclaimed).toBe(false)
    expect(client.getQueryData(claimQueryKey())).toBe(false)

    await act(async () => newOwnerRead.resolve(true))
    await waitFor(() => expect(result.current.hasFreshClaimedResult).toBe(true))

    expect(result.current.claimed.data).toBe(true)
    expect(result.current.isConfirmedUnclaimed).toBe(false)
    expect(readClaimed).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ ownerAddress: otherOwnerAddress }),
    )
  })

  it('isolates network caches and refetches when returning to the supported chain', async () => {
    const client = createClient()
    const { result, rerender } = mountAvailability(client)
    await waitFor(() => expect(result.current.isConfirmedUnclaimed).toBe(true))
    client.setQueryData(claimQueryKey({ chainId: mainnet.id }), true)

    vi.mocked(useChainId).mockReturnValue(mainnet.id)
    rerender({ ownerAddress, enabled: true })

    expect(result.current.supported).toBe(false)
    expect(result.current.claimed.data).toBe(true)
    expect(result.current.hasFreshClaimedResult).toBe(false)
    expect(result.current.isConfirmedUnclaimed).toBe(false)
    expect(readClaimed).toHaveBeenCalledTimes(1)

    const pendingRead = deferred<boolean>()
    readClaimed.mockReturnValueOnce(pendingRead.promise)
    vi.mocked(useChainId).mockReturnValue(sepolia.id)
    rerender({ ownerAddress, enabled: true })

    expect(result.current.claimed.data).toBe(false)
    expect(result.current.isConfirmedUnclaimed).toBe(false)
    await act(async () => pendingRead.resolve(true))
    await waitFor(() => expect(result.current.hasFreshClaimedResult).toBe(true))
    expect(result.current.claimed.data).toBe(true)
    expect(result.current.isConfirmedUnclaimed).toBe(false)
  })

  it('updates a mounted observer from unclaimed to minted after claim invalidation', async () => {
    const client = createClient()
    const { result } = mountAvailability(client)
    await waitFor(() => expect(result.current.isConfirmedUnclaimed).toBe(true))

    readClaimed.mockResolvedValue(true)
    await act(async () =>
      invalidateCommemorativeNftStatus({
        queryClient: client,
        ownerAddress,
        chainId: sepolia.id,
      }),
    )
    await waitFor(() => expect(result.current.claimed.data).toBe(true))

    expect(result.current.hasFreshClaimedResult).toBe(true)
    expect(result.current.isConfirmedUnclaimed).toBe(false)
    expect(readClaimed).toHaveBeenCalledTimes(2)
  })

  it('does not reuse version-2 ineligibility based on the previous WebP requirement', async () => {
    const client = createClient()
    client.setQueryData(
      qk('commemorative_nft', 'eligibility', {
        ownerAddress: ownerAddress.toLowerCase(),
        assetOrigin: getCommemorativeNftConfig().assetOrigin,
        metadataUrl: buildCommemorativeNftAssets(
          getCommemorativeNftConfig().assetOrigin,
          ownerAddress,
        ).metadataUrl,
        validationVersion: 2,
      }),
      { status: 'ineligible' },
    )
    const pendingEligibility = deferred<CommemorativeNftEligibilityResult>()
    fetchEligibility.mockReturnValueOnce(pendingEligibility.promise)
    const { result } = mountAvailability(client)

    expect(result.current.eligibility.data).toBeUndefined()

    await act(async () =>
      pendingEligibility.resolve({
        status: 'eligible',
        eligibility: {
          ...createCommemorativeNftPreviewEligibility({ ownerAddress }),
          source: 'static',
        },
      }),
    )
    await waitFor(() =>
      expect(result.current.eligibility.data?.status).toBe('eligible'),
    )
    expect(fetchEligibility).toHaveBeenCalledTimes(1)
  })

  it('discards eligible data cached with the previous asset version key', async () => {
    const client = createClient()
    const eligibility = {
      ...createCommemorativeNftPreviewEligibility({ ownerAddress }),
      source: 'static' as const,
    }
    client.setQueryData(
      qk('commemorative_nft', 'eligibility', {
        ownerAddress: ownerAddress.toLowerCase(),
        assetOrigin: getCommemorativeNftConfig().assetOrigin,
        assetVersion: '20260907-token-directories',
        validationVersion: 3,
      }),
      { status: 'eligible', eligibility },
    )
    const pendingEligibility = deferred<CommemorativeNftEligibilityResult>()
    fetchEligibility.mockReturnValueOnce(pendingEligibility.promise)
    const { result } = mountAvailability(client)

    expect(result.current.eligibility.data).toBeUndefined()

    await act(async () =>
      pendingEligibility.resolve({ status: 'eligible', eligibility }),
    )
    await waitFor(() =>
      expect(result.current.eligibility.data?.status).toBe('eligible'),
    )
    expect(fetchEligibility).toHaveBeenCalledTimes(1)
  })

  it('rechecks missing JSON on remount so newly published metadata becomes available', async () => {
    const client = createClient()
    fetchEligibility.mockResolvedValueOnce({ status: 'ineligible' })
    const first = mountAvailability(client)
    await waitFor(() =>
      expect(first.result.current.eligibility.data).toEqual({
        status: 'ineligible',
      }),
    )
    first.unmount()

    const reopened = mountAvailability(client)
    await waitFor(() =>
      expect(reopened.result.current.eligibility.data?.status).toBe('eligible'),
    )

    expect(fetchEligibility).toHaveBeenCalledTimes(2)
  })
})
