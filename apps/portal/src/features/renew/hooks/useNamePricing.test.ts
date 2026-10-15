// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getRenewalPriceQueryOptions } from '@/features/register/hooks/useRenewalPrice'
import { SUPPORTED_TOKENS } from '@/lib/constants/tokens'
import { createTestQueryClient } from '@/test-utils'
import { getRenewerAddress } from '../utils/renewer'
import { useNamePricing } from './useNamePricing'

// WEB-1485 (Immunefi #92608): the Extend modal's price and the confirm step's
// token picker read the same renewal price. They used to sit under two cache
// keys (the modal omitted the token), so one read could succeed while the other
// failed. The modal also had no way to retry a failed read.

const getRenewPrice = vi.fn()
vi.mock('@ensdomains/ensjs/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ensdomains/ensjs/public')>()),
  getRenewPrice: (...args: unknown[]) => getRenewPrice(...args),
}))

vi.mock('@/features/register/hooks/useBaseRate', () => ({
  useBaseRate: () => 0n,
}))

const SELECTED = { name: 'example.eth', isV2: true }
const ONE_YEAR = { type: 'years', years: 1 } as const
const AMOUNT = 5_000_000n

const renderPricing = () => {
  const queryClient = createTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  const hook = renderHook(() => useNamePricing(SELECTED, ONE_YEAR), {
    wrapper,
  })
  return { queryClient, ...hook }
}

/** The key the confirm step's picker reads the USDC renewal price under. */
const pickerUsdcKey = (durationSeconds: number) =>
  getRenewalPriceQueryOptions({
    name: SELECTED.name,
    duration: durationSeconds,
    token: SUPPORTED_TOKENS.USDC,
    renewerAddress: getRenewerAddress(SELECTED.isV2),
  }).queryKey

describe('useNamePricing', () => {
  beforeEach(() => {
    getRenewPrice.mockReset()
  })

  it('prices in USDC on the cache entry the token picker reads', async () => {
    getRenewPrice.mockResolvedValue({ amount: AMOUNT })

    const { result, queryClient } = renderPricing()

    await waitFor(() => expect(result.current.price).not.toBeNull())
    expect(getRenewPrice).toHaveBeenCalledOnce()
    expect(getRenewPrice.mock.calls[0][1]).toMatchObject({
      paymentToken: SUPPORTED_TOKENS.USDC,
    })
    // Round trip: what the modal wrote is what the picker will read.
    expect(
      queryClient.getQueryData(pickerUsdcKey(result.current.durationSeconds)),
    ).toEqual(result.current.price)
  })

  it('reports a failed read with no price, and refetch recovers it', async () => {
    getRenewPrice
      .mockRejectedValueOnce(new Error('HTTP 500 from dRPC'))
      .mockResolvedValue({ amount: AMOUNT })

    const { result } = renderPricing()

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.price).toBeNull()
    expect(result.current.display).toBeNull()

    act(() => result.current.refetch())

    await waitFor(() => expect(result.current.price?.total).toBe(AMOUNT))
    expect(result.current.isError).toBe(false)
  })
})
