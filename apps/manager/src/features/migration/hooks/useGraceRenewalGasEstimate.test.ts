import { renderHook } from '@testing-library/react'
import type { Address, PublicClient } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeDomain, OWNER } from '../service/_fixtures'
import type { GraceRenewalMigrationGasEstimate } from '../service/estimateGraceRenewalMigrationGas'
import type { GraceRenewalQuote } from '../service/graceRenewal'
import { useGraceRenewalGasEstimate } from './useGraceRenewalGasEstimate'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  config: vi.fn(),
  estimate: vi.fn(),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: mocks.query,
}))
vi.mock('wagmi', () => ({ useConfig: mocks.config }))
vi.mock('../service/estimateGraceRenewalMigrationGas', () => ({
  estimateGraceRenewalMigrationGas: mocks.estimate,
}))

const HCA: Address = '0x0000000000000000000000000000000000000002'
const graceDomain = makeDomain({
  id: '0x01',
  name: 'grace.eth',
  registrationExpiry: '1000',
})
const activeDomain = makeDomain({
  id: '0x02',
  name: 'active.eth',
  registrationExpiry: '99999999999',
})
const unselectedDomain = makeDomain({ id: '0x03', name: 'other.eth' })
const quote: GraceRenewalQuote = {
  ownerAddress: OWNER,
  chainId: 1,
  paymentToken: '0x0000000000000000000000000000000000000003',
  renewerAddress: '0x0000000000000000000000000000000000000004',
  items: [
    {
      domain: graceDomain,
      label: 'grace',
      registrationExpiry: 1000n,
      duration: 86_400n,
      targetExpiry: 87_400n,
      amount: 1_000_000n,
    },
  ],
  totalAmount: 1_000_000n,
  balance: 10_000_000n,
  expiresAt: 2000n,
  quotedAtMs: 1_000_000,
}
const estimate: GraceRenewalMigrationGasEstimate = {
  gasUnits: 321_000n,
  feeWei: 321_000_000_000_000n,
  transactionCount: 3,
  stepDescriptors: [
    { type: 'renewal-approval' },
    { type: 'renew-grace', count: 1 },
    {
      type: 'atomic-batch',
      index: 0,
      total: 1,
      count: 2,
      migrateCount: 2,
      copyCount: 0,
      roleGrants: [],
    },
  ],
}
type Params = Parameters<typeof useGraceRenewalGasEstimate>[0]
const params: Params = {
  renewal: { status: 'ready', quote },
  selectedNames: [graceDomain.name, activeDomain.name],
  v1Names: [graceDomain, activeDomain, unselectedDomain],
  hcaAddress: HCA,
  publicClient: { chain: { id: 1 } } as PublicClient,
  isEnabled: true,
}
const wagmiConfig = { chains: [{ id: 1 }] }
const queryOptions = () =>
  mocks.query.mock.lastCall?.[0] as {
    enabled: boolean
    queryKey: readonly unknown[]
    placeholderData: (
      previousData: GraceRenewalMigrationGasEstimate | undefined,
      previousQuery: { queryKey: readonly unknown[] } | undefined,
    ) => GraceRenewalMigrationGasEstimate | undefined
    queryFn: (context: { signal: AbortSignal }) => Promise<unknown>
  }
const renewalWith = (
  overrides: Partial<GraceRenewalQuote>,
): Params['renewal'] => ({
  status: 'ready',
  quote: { ...quote, ...overrides },
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.config.mockReturnValue(wagmiConfig)
  mocks.query.mockReturnValue({ isPending: true })
  mocks.estimate.mockResolvedValue(estimate)
})
afterEach(() => vi.restoreAllMocks())

describe('useGraceRenewalGasEstimate', () => {
  it('estimates renewal and migration for all selected names, including active names', async () => {
    const { unmount } = renderHook(() => useGraceRenewalGasEstimate(params))
    const signal = new AbortController().signal

    expect(queryOptions().enabled).toBe(true)
    await expect(queryOptions().queryFn({ signal })).resolves.toEqual(estimate)
    expect(mocks.estimate).toHaveBeenCalledExactlyOnceWith({
      quote,
      domains: [graceDomain, activeDomain],
      hcaAddress: HCA,
      publicClient: params.publicClient,
      wagmiConfig,
      managerRestorationNames: [],
      signal,
    })
    unmount()
  })

  it('estimates with the manager restoration choice and re-estimates when it changes', async () => {
    const { rerender, unmount } = renderHook(useGraceRenewalGasEstimate, {
      initialProps: params,
    })
    const initialKey = queryOptions().queryKey

    rerender({ ...params, managerRestorationNames: [graceDomain.name] })
    expect(queryOptions().queryKey).not.toEqual(initialKey)
    await queryOptions().queryFn({ signal: new AbortController().signal })
    expect(mocks.estimate).toHaveBeenCalledWith(
      expect.objectContaining({ managerRestorationNames: [graceDomain.name] }),
    )
    unmount()
  })

  it('invalidates the estimate when the selection or renewal quote changes', () => {
    const { rerender, unmount } = renderHook(useGraceRenewalGasEstimate, {
      initialProps: params,
    })
    const initialKey = queryOptions().queryKey

    rerender({ ...params, selectedNames: [graceDomain.name] })
    expect(queryOptions().queryKey).not.toEqual(initialKey)

    rerender({
      ...params,
      renewal: {
        status: 'ready',
        quote: { ...quote, quotedAtMs: quote.quotedAtMs + 30_000 },
      },
    })
    expect(queryOptions().queryKey).not.toEqual(initialKey)

    rerender({
      ...params,
      selectedNames: [...params.selectedNames].reverse(),
    })
    expect(queryOptions().queryKey).toEqual(initialKey)
    unmount()
  })

  it.each([
    { label: 'disabled', overrides: { isEnabled: false } },
    {
      label: 'no renewal',
      overrides: { renewal: { status: 'idle' as const } },
    },
    {
      label: 'failed renewal quote',
      overrides: {
        renewal: { status: 'error' as const, message: 'Quote unavailable' },
      },
    },
  ])('stays idle with $label even if an old estimate is cached', ({
    overrides,
  }) => {
    mocks.query.mockReturnValue({ data: estimate })
    const { result, unmount } = renderHook(() =>
      useGraceRenewalGasEstimate({ ...params, ...overrides }),
    )

    expect(queryOptions().enabled).toBe(false)
    expect(result.current).toEqual({ status: 'idle' })
    expect(mocks.estimate).not.toHaveBeenCalled()
    unmount()
  })

  it('shows loading before the first estimate is available', () => {
    mocks.query.mockReturnValue({ isPending: true })
    const { result, unmount } = renderHook(() =>
      useGraceRenewalGasEstimate(params),
    )

    expect(result.current).toEqual({ status: 'loading' })
    unmount()
  })

  it('retains the estimate and wallet requests during background refetching', () => {
    mocks.query.mockReturnValue({ isFetching: true, data: estimate })
    const { result, unmount } = renderHook(() =>
      useGraceRenewalGasEstimate(params),
    )

    expect(result.current).toEqual({
      status: 'ready',
      ...estimate,
      formattedEth: '0.000321',
    })
    unmount()
  })

  it('preserves the same selection estimate while refreshed durations and prices are estimated', () => {
    mocks.query.mockReturnValue({ data: estimate })
    const { result, rerender, unmount } = renderHook(
      useGraceRenewalGasEstimate,
      {
        initialProps: params,
      },
    )
    const previousQuery = { queryKey: queryOptions().queryKey }
    mocks.query.mockImplementation(
      (options: ReturnType<typeof queryOptions>) => ({
        isFetching: true,
        data: options.placeholderData(estimate, previousQuery),
      }),
    )

    rerender({
      ...params,
      renewal: renewalWith({
        quotedAtMs: quote.quotedAtMs + 30_000,
        expiresAt: quote.expiresAt + 30n,
        totalAmount: quote.totalAmount + 100n,
        items: quote.items.map((item) => ({
          ...item,
          duration: item.duration + 30n,
          targetExpiry: item.targetExpiry + 30n,
          amount: item.amount + 100n,
        })),
      }),
    })

    expect(queryOptions().queryKey).not.toEqual(previousQuery.queryKey)
    expect(result.current).toEqual({
      status: 'ready',
      ...estimate,
      formattedEth: '0.000321',
    })
    unmount()
  })

  it.each([
    {
      label: 'selected names',
      overrides: { selectedNames: [graceDomain.name] },
    },
    {
      label: 'owner',
      overrides: { renewal: renewalWith({ ownerAddress: HCA }) },
    },
    { label: 'HCA', overrides: { hcaAddress: OWNER } },
    {
      label: 'network',
      overrides: { publicClient: { chain: { id: 2 } } as PublicClient },
    },
    {
      label: 'quote network',
      overrides: { renewal: renewalWith({ chainId: 2 }) },
    },
    {
      label: 'payment token',
      overrides: { renewal: renewalWith({ paymentToken: HCA }) },
    },
    {
      label: 'renewal contract',
      overrides: { renewal: renewalWith({ renewerAddress: HCA }) },
    },
    {
      label: 'selected domain metadata',
      overrides: {
        v1Names: [
          graceDomain,
          { ...activeDomain, owner: { id: HCA } },
          unselectedDomain,
        ],
      },
    },
    {
      label: 'renewal membership',
      overrides: { renewal: renewalWith({ items: [] }) },
    },
    {
      label: 'renewal eligibility',
      overrides: {
        renewal: renewalWith({
          items: quote.items.map((item) => ({ ...item, duration: 0n })),
        }),
      },
    },
    {
      label: 'renewal domain metadata',
      overrides: {
        renewal: renewalWith({
          items: quote.items.map((item) => ({
            ...item,
            domain: { ...item.domain, registrant: { id: HCA } },
          })),
        }),
      },
    },
  ] satisfies readonly {
    label: string
    overrides: Partial<Params>
  }[])('drops the previous estimate when $label changes', ({ overrides }) => {
    mocks.query.mockReturnValue({ data: estimate })
    const { result, rerender, unmount } = renderHook(
      useGraceRenewalGasEstimate,
      {
        initialProps: params,
      },
    )
    const previousQuery = { queryKey: queryOptions().queryKey }
    mocks.query.mockImplementation(
      (options: ReturnType<typeof queryOptions>) => ({
        isFetching: true,
        data: options.placeholderData(estimate, previousQuery),
      }),
    )

    rerender({ ...params, ...overrides })

    expect(
      queryOptions().placeholderData(estimate, previousQuery),
    ).toBeUndefined()
    expect(result.current).toEqual({ status: 'loading' })
    unmount()
  })

  it('waits for a refreshed renewal quote before exposing a cached estimate', () => {
    mocks.query.mockReturnValue({ data: estimate })
    const { result, unmount } = renderHook(() =>
      useGraceRenewalGasEstimate({
        ...params,
        renewal: { status: 'loading' },
      }),
    )

    expect(queryOptions().enabled).toBe(false)
    expect(result.current).toEqual({ status: 'loading' })
    unmount()
  })

  it('preserves nonzero network fees smaller than six decimal places', () => {
    mocks.query.mockReturnValue({ data: { ...estimate, feeWei: 123_400_000n } })
    const { result, unmount } = renderHook(() =>
      useGraceRenewalGasEstimate(params),
    )

    expect(result.current).toEqual({
      status: 'ready',
      gasUnits: estimate.gasUnits,
      transactionCount: estimate.transactionCount,
      stepDescriptors: estimate.stepDescriptors,
      feeWei: 123_400_000n,
      formattedEth: '0.0000000001234',
    })
    unmount()
  })

  it('returns an estimation failure without a previously cached fee', async () => {
    const cause = new Error('RPC response containing private details')
    mocks.estimate.mockRejectedValue(cause)
    const { result, rerender, unmount } = renderHook(() =>
      useGraceRenewalGasEstimate(params),
    )
    await expect(
      queryOptions().queryFn({ signal: new AbortController().signal }),
    ).rejects.toBe(cause)

    mocks.query.mockReturnValue({
      isError: true,
      isFetching: true,
      error: cause,
      data: estimate,
    })
    rerender()
    expect(result.current).toEqual({
      status: 'error',
      stage: 'fee',
      reason: 'fee-unavailable',
      cause,
    })
    unmount()
  })

  it('rejects a partial domain list instead of quoting only known selected names', async () => {
    const { unmount } = renderHook(() =>
      useGraceRenewalGasEstimate({
        ...params,
        selectedNames: [...params.selectedNames, 'missing.eth'],
      }),
    )

    await expect(
      queryOptions().queryFn({ signal: new AbortController().signal }),
    ).rejects.toThrow(
      'Could not estimate the network fee for every selected name.',
    )
    expect(mocks.estimate).not.toHaveBeenCalled()
    unmount()
  })
})
