import { renderHook } from '@testing-library/react'
import { ok } from 'neverthrow'
import type { Address } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const PARENT_REGISTRY = '0x1111111111111111111111111111111111111111' as Address

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: { id: 11155111 } }),
}))

const expiryQuery: {
  data: bigint | undefined
  isLoading: boolean
  isError: boolean
} = {
  data: undefined,
  isLoading: false,
  isError: false,
}

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQuery: (options: { queryKey: readonly unknown[] }) =>
      options.queryKey[0] === 'get-subname-expiry'
        ? expiryQuery
        : { data: undefined, isLoading: false, isError: false },
  }
})

const { useSubnameExpiry } = await import('./useSubnameExpiry')

const NOW_SECONDS = 1_800_000_000

const render = () =>
  renderHook(() =>
    useSubnameExpiry({
      name: 'sub.alice.eth',
      registryAddress: PARENT_REGISTRY,
    }),
  ).result.current

describe('useSubnameExpiry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW_SECONDS * 1000)
    Object.assign(expiryQuery, {
      data: undefined,
      isLoading: false,
      isError: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports an expiry in the past as expired', () => {
    expiryQuery.data = BigInt(NOW_SECONDS - 1)

    expect(render().isExpired).toBe(true)
  })

  it('does not report an expiry in the future as expired', () => {
    expiryQuery.data = BigInt(NOW_SECONDS + 86_400)

    expect(render().isExpired).toBe(false)
  })

  // A registry returns 0 for a label with no expiry set — a non-expiring
  // subname. Read naively as a timestamp that is "0 seconds since the epoch",
  // it would block the transfer of every such name.
  it('treats a zero expiry as no expiry, not as expired at the epoch', () => {
    expiryQuery.data = 0n

    expect(render().isExpired).toBe(false)
  })

  it('does not claim expiry while the read is still in flight', () => {
    Object.assign(expiryQuery, { data: undefined, isLoading: true })

    const { isExpired, isLoading } = render()

    expect(isExpired).toBe(false)
    expect(isLoading).toBe(true)
  })

  it('surfaces a failed read as isError rather than as "not expired"', () => {
    Object.assign(expiryQuery, { data: undefined, isError: true })

    const { isExpired, isError } = render()

    expect(isError).toBe(true)
    expect(isExpired).toBe(false)
  })
})
