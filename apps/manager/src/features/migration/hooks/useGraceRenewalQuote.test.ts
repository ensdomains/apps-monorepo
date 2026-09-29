import {
  QueryClient,
  QueryClientProvider,
  type QueryKey,
} from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { err } from 'neverthrow'
import { createElement, type ReactNode } from 'react'
import type { Address, PublicClient } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeDomain } from '../service/_fixtures'
import type { GraceRenewalQuote } from '../service/graceRenewal'
import { useGraceRenewalQuote } from './useGraceRenewalQuote'

const mocks = vi.hoisted(() => ({ quote: vi.fn() }))
vi.mock('../service/graceRenewal', () => ({
  getGraceRenewalQuote: mocks.quote,
}))

const OWNER: Address = '0x1111111111111111111111111111111111111111'
const OTHER_OWNER: Address = '0x2222222222222222222222222222222222222222'
const NOW = 2_000_000_000_000
const CHAIN_ID = 11_155_111
const domain = makeDomain({ name: 'alice.eth' })
const otherDomain = makeDomain({ name: 'bob.eth' })
const quote = {
  ownerAddress: OWNER,
  chainId: CHAIN_ID,
  quotedAtMs: NOW - 60_000,
  expiresAt: BigInt((NOW + 240_000) / 1000),
} as GraceRenewalQuote
const params: Parameters<typeof useGraceRenewalQuote>[0] = {
  domains: [domain],
  ownerAddress: OWNER,
  publicClient: { chain: { id: CHAIN_ID } } as PublicClient,
  enabled: true,
}
const queryKey = (
  ownerAddress: Address | undefined = OWNER,
  names: readonly string[] = [domain.name],
) => [
  'migration-grace-renewal',
  CHAIN_ID,
  ownerAddress?.toLowerCase(),
  [...names].sort(),
]

let queryClient: QueryClient
const wrapper = ({ children }: { readonly children: ReactNode }) =>
  createElement(QueryClientProvider, { client: queryClient }, children)

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  mocks.quote.mockReset()
  mocks.quote.mockImplementation(() => new Promise(() => {}))
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
})

afterEach(() => {
  queryClient.clear()
  vi.restoreAllMocks()
})

const cacheQuote = (cachedQuote = quote, key: QueryKey = queryKey()) => {
  queryClient.setQueryData(key, cachedQuote, { updatedAt: NOW - 60_000 })
}

describe('useGraceRenewalQuote background refresh', () => {
  it('shows loading until the initial quote is available', () => {
    const { result } = renderHook(() => useGraceRenewalQuote(params), {
      wrapper,
    })

    expect(result.current).toEqual({ status: 'loading' })
    expect(mocks.quote).toHaveBeenCalledOnce()
  })

  it('retains a valid quote while refreshing the same account and selection', () => {
    cacheQuote()
    const { result } = renderHook(() => useGraceRenewalQuote(params), {
      wrapper,
    })

    expect(queryClient.isFetching()).toBe(1)
    expect(result.current).toEqual({ status: 'ready', quote })
  })

  it.each([
    { expiresAt: BigInt(NOW / 1000) },
    { quotedAtMs: NOW - 300_000 },
  ])('hides an expired quote while its replacement loads: %s', (expiry) => {
    cacheQuote({ ...quote, ...expiry })
    const { result } = renderHook(() => useGraceRenewalQuote(params), {
      wrapper,
    })

    expect(queryClient.isFetching()).toBe(1)
    expect(result.current).toEqual({ status: 'loading' })
  })

  it('shows refresh errors instead of keeping the old quote actionable', async () => {
    cacheQuote()
    mocks.quote.mockResolvedValue(err(new Error('Renewal quote unavailable.')))
    const { result } = renderHook(() => useGraceRenewalQuote(params), {
      wrapper,
    })

    await waitFor(() =>
      expect(result.current).toEqual({
        status: 'error',
        message: 'Renewal quote unavailable.',
      }),
    )
    expect(queryClient.getQueryData(queryKey())).toEqual(quote)
  })

  it('returns idle when disabled even if a valid quote is cached', () => {
    cacheQuote()
    const { result } = renderHook(
      () => useGraceRenewalQuote({ ...params, enabled: false }),
      { wrapper },
    )

    expect(result.current).toEqual({ status: 'idle' })
    expect(mocks.quote).not.toHaveBeenCalled()
  })

  it('does not expose cached data when the owner is missing', () => {
    cacheQuote(quote, [
      'migration-grace-renewal',
      CHAIN_ID,
      undefined,
      [domain.name],
    ])
    const { result } = renderHook(
      () => useGraceRenewalQuote({ ...params, ownerAddress: undefined }),
      { wrapper },
    )

    expect(result.current).toEqual({ status: 'idle' })
    expect(mocks.quote).not.toHaveBeenCalled()
  })

  it.each([
    { ownerAddress: OTHER_OWNER },
    { domains: [otherDomain] },
  ])('does not retain the prior quote after its identity changes: %s', (change) => {
    cacheQuote()
    const { result, rerender } = renderHook(
      (input: typeof params) => useGraceRenewalQuote(input),
      { wrapper, initialProps: params },
    )
    expect(result.current).toEqual({ status: 'ready', quote })

    rerender({ ...params, ...change })

    expect(result.current).toEqual({ status: 'loading' })
    expect(mocks.quote).toHaveBeenLastCalledWith({
      domains: params.domains,
      ownerAddress: OWNER,
      publicClient: params.publicClient,
      ...change,
    })
  })
})
