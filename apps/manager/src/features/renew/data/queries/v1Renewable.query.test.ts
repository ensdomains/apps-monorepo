import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { ok } from 'neverthrow'
import { createElement, type PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getIsV1Renewable,
  getIsV1RenewableBatch,
  getV1RenewableQueryOptions,
  useV1Renewable,
} from './v1Renewable.query'

const mocks = vi.hoisted(() => ({
  isRenewable: vi.fn(),
  multicall: vi.fn(),
  client: {},
}))

vi.mock('@ensdomains/ensjs/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ensdomains/ensjs/public')>()),
  isRenewable: mocks.isRenewable,
}))

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok(mocks.client),
}))

vi.mock('viem/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/actions')>()),
  multicall: mocks.multicall,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('V1 renewability', () => {
  it.each([
    true,
    false,
  ])('returns the on-chain eligibility result %s', async (value) => {
    mocks.isRenewable.mockResolvedValue(value)

    const result = await getIsV1Renewable('alice.eth')

    expect(result._unsafeUnwrap()).toBe(value)
    expect(mocks.isRenewable).toHaveBeenCalledWith(
      mocks.client,
      expect.objectContaining({ label: 'alice' }),
    )
  })

  it('rejects subnames before querying the renewer', async () => {
    const result = await getIsV1Renewable('sub.alice.eth')

    expect(result.isErr()).toBe(true)
    expect(mocks.isRenewable).not.toHaveBeenCalled()
  })

  it('keys renewability by protocol and renewer', () => {
    const key = getV1RenewableQueryOptions('alice.eth').queryKey?.[0]

    expect(key).toMatchObject({ protocol: 'v1' })
    expect(key && 'renewerAddress' in key).toBe(true)
  })

  it('uses one multicall for visible names and preserves per-name query data', async () => {
    mocks.multicall
      .mockResolvedValueOnce([
        { status: 'success', result: true },
        { status: 'success', result: false },
      ])
      .mockResolvedValueOnce([
        { status: 'success', result: false },
        { status: 'success', result: false },
      ])
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client: queryClient }, children)

    const { result } = renderHook(
      () => useV1Renewable(['alice.eth', 'bob.eth', 'alice.eth']),
      { wrapper },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mocks.multicall).toHaveBeenCalledTimes(1)
    expect(mocks.multicall).toHaveBeenCalledWith(
      mocks.client,
      expect.objectContaining({
        allowFailure: true,
        contracts: [
          expect.objectContaining({ args: ['alice'] }),
          expect.objectContaining({ args: ['bob'] }),
        ],
      }),
    )
    expect(
      queryClient.getQueryData(
        getV1RenewableQueryOptions('alice.eth').queryKey,
      ),
    ).toBe(true)
    expect(
      queryClient.getQueryData(getV1RenewableQueryOptions('bob.eth').queryKey),
    ).toBe(false)
    expect(result.current.isRenewable('alice.eth')).toBe(true)
    expect(result.current.isRenewable('bob.eth')).toBe(false)
    expect(mocks.isRenewable).not.toHaveBeenCalled()

    await queryClient.invalidateQueries({
      queryKey: getV1RenewableQueryOptions('alice.eth').queryKey,
    })
    await waitFor(() =>
      expect(result.current.isRenewable('alice.eth')).toBe(false),
    )
    expect(mocks.multicall).toHaveBeenCalledTimes(2)
    expect(
      queryClient.getQueryData(getV1RenewableQueryOptions('bob.eth').queryKey),
    ).toBe(false)
  })

  it('retries only a failed multicall entry with a direct read', async () => {
    mocks.multicall.mockResolvedValue([
      { status: 'success', result: true },
      { status: 'failure', error: new Error('reverted') },
    ])
    mocks.isRenewable.mockResolvedValue(false)

    const results = await getIsV1RenewableBatch(['alice.eth', 'bob.eth'])

    expect(results.get('alice.eth')?._unsafeUnwrap()).toBe(true)
    expect(results.get('bob.eth')?._unsafeUnwrap()).toBe(false)
    expect(mocks.isRenewable).toHaveBeenCalledTimes(1)
    expect(mocks.isRenewable).toHaveBeenCalledWith(
      mocks.client,
      expect.objectContaining({ label: 'bob' }),
    )
  })

  it('keeps a failed direct fallback isolated to its own name', async () => {
    mocks.multicall.mockRejectedValue(new Error('multicall unavailable'))
    mocks.isRenewable.mockImplementation((_, { label }: { label: string }) =>
      label === 'bob'
        ? Promise.reject(new Error('direct read failed'))
        : Promise.resolve(true),
    )

    const results = await getIsV1RenewableBatch(['alice.eth', 'bob.eth'])

    expect(results.get('alice.eth')?._unsafeUnwrap()).toBe(true)
    expect(results.get('bob.eth')?.isErr()).toBe(true)
    expect(mocks.isRenewable).toHaveBeenCalledTimes(2)
  })
})
