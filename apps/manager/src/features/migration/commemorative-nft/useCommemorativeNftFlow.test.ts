import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChainId, useConfig } from 'wagmi'
import {
  claimCommemorativeNft,
  readCommemorativeNftClaimed,
  waitForCommemorativeNftClaimReceipt,
} from './contract'
import { fetchCommemorativeNftEligibility } from './eligibility'
import { createCommemorativeNftPreviewEligibility } from './eligibility.fixture'
import { commemorativeNftClaimedQueryOptions } from './queries'
import type { CommemorativeNftEligibility } from './types'
import { useCommemorativeNftFlow } from './useCommemorativeNftFlow'

vi.mock('wagmi', () => ({ useChainId: vi.fn(), useConfig: vi.fn() }))
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

const ownerAddress = '0x03Ba34f6Ea1496fa316873CF8350A3f7eaD317EF'
const wagmiConfig = {} as ReturnType<typeof useConfig>
const eligibility: CommemorativeNftEligibility = {
  ...createCommemorativeNftPreviewEligibility({
    ownerAddress,
    profileName: 'yoginth.eth',
  }),
  source: 'static',
  proof: ['0x017995f95e79303c1853e326b15e6dcc16e6aa20f07372e4f0ab63c0b84f2631'],
  assets: { imageUrl: 'https://assets.example/art.webp' },
}
const readClaimed = vi.mocked(readCommemorativeNftClaimed)
const claim = vi.mocked(claimCommemorativeNft)
const waitForReceipt = vi.mocked(waitForCommemorativeNftClaimReceipt)
const fetchEligibility = vi.mocked(fetchCommemorativeNftEligibility)
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
        migratedNameCount: 1,
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
    vi.clearAllMocks()
    vi.mocked(useChainId).mockReturnValue(11155111)
    vi.mocked(useConfig).mockReturnValue(wagmiConfig)
    fetchEligibility.mockResolvedValue({ status: 'eligible', eligibility })
    readClaimed.mockResolvedValue(false)
    claim.mockResolvedValue('0xabc')
    waitForReceipt.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    for (const client of clients.splice(0)) client.clear()
    vi.restoreAllMocks()
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
    expect(result.current.state.status).toBe('revealing')
    expect(result.current.canMint).toBe(false)
    act(() => result.current.completeReveal())
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

  it('requires the artwork callback when the static image is unavailable', async () => {
    fetchEligibility.mockResolvedValueOnce({
      status: 'eligible',
      eligibility: { ...eligibility, assets: {} },
    })
    const { result } = mountFlow(createClient())

    await waitFor(() =>
      expect(result.current.admission.status).toBe('admitted'),
    )
    expect(result.current.state.status).toBe('revealing')
    expect(result.current.canMint).toBe(false)
    act(() => result.current.completeReveal())
    expect(result.current.canMint).toBe(true)
  })

  it('retains this opening after a confirmed mint and suppresses the next opening', async () => {
    const pendingReceipt = deferred<void>()
    waitForReceipt.mockReturnValueOnce(pendingReceipt.promise)
    const client = createClient()
    const flow = mountFlow(client)
    await waitFor(() =>
      expect(flow.result.current.admission.status).toBe('admitted'),
    )
    act(() => flow.result.current.completeReveal())

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
    await act(async () => pendingReceipt.resolve())
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
    expect(result.current.state.status).toBe('revealing')
  })

  it('prevents another claim when the same owner reopens during a pending receipt', async () => {
    const pendingReceipt = deferred<void>()
    waitForReceipt.mockReturnValueOnce(pendingReceipt.promise)
    const client = createClient()
    const first = mountFlow(client)
    await waitFor(() =>
      expect(first.result.current.admission.status).toBe('admitted'),
    )
    act(() => first.result.current.completeReveal())
    act(() => first.result.current.mint())
    await waitFor(() =>
      expect(first.result.current.state.status).toBe('minting'),
    )
    first.unmount()

    const reopened = mountFlow(client)
    await waitFor(() =>
      expect(reopened.result.current.admission.status).toBe('admitted'),
    )
    act(() => reopened.result.current.completeReveal())
    act(() => reopened.result.current.mint())
    expect(reopened.result.current.state.status).toBe('minting')
    expect(reopened.result.current.canMint).toBe(false)
    expect(claim).toHaveBeenCalledTimes(1)

    readClaimed.mockResolvedValue(true)
    await act(async () => pendingReceipt.resolve())
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
    act(() => result.current.completeReveal())
    act(() => expect(result.current.mint()).toBeUndefined())

    await waitFor(() => expect(result.current.state.status).toBe('error'))
    expect(result.current.admission.status).toBe('admitted')
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.canMint).toBe(true))
  })

  it('can retry the status read after a receipt without allowing another mint', async () => {
    readClaimed
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('RPC unavailable after receipt'))
    const { result } = mountFlow(createClient())
    await waitFor(() =>
      expect(result.current.admission.status).toBe('admitted'),
    )
    act(() => result.current.completeReveal())
    act(() => result.current.mint())
    await waitFor(() => expect(result.current.state.status).toBe('error'))

    readClaimed.mockResolvedValue(true)
    act(() => {
      result.current.retry()
      result.current.mint()
    })
    await waitFor(() => expect(result.current.state.status).toBe('minted'))
    expect(result.current.admission.status).toBe('admitted')
    expect(claim).toHaveBeenCalledTimes(1)
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

  it('prevents minting with a disconnected or different wallet', async () => {
    const { result } = mountFlow(createClient(), { walletAddress: undefined })
    await waitFor(() =>
      expect(result.current.admission.status).toBe('admitted'),
    )
    act(() => result.current.completeReveal())
    act(() => result.current.mint())

    expect(result.current.canMint).toBe(false)
    expect(claim).not.toHaveBeenCalled()
  })
})
