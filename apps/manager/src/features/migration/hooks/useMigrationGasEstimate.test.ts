import { type FetchQueryOptions, QueryClient } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { type Address, TimeoutError, zeroHash } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chain } from '@/config'
import { V1_CONTRACTS } from '../contracts/addresses'
import { makeClassified, makeDomain } from '../service/_fixtures'
import { makeRpcSubnameInventory } from '../service/_fixtures/rpcSubnameInventory'
import { DirectMigrationRouteError } from '../service/directMigrationRoutes'
import { migrationPreparationFailure } from '../service/migrationPreparationError'
import { getRpcSubnameInventoryCacheKey } from '../service/rpcSubnameInventoryCache'
import { getSubnameMigrationImpactQueryOptions } from '../service/subnameMigrationImpactQuery'
import { discoverSubnameRecreation } from '../service/subnameRecreation'
import { useMigrationGasEstimate } from './useMigrationGasEstimate'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  client: vi.fn(),
  preflight: vi.fn(),
  plan: vi.fn(),
  recoveryPlan: vi.fn(),
  estimate: vi.fn(),
  recovery: vi.fn(),
  impactCheck: vi.fn(),
  queryClient: {
    getQueryState: vi.fn(),
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
  },
}))
vi.mock('../service/subnameRecreation', () => ({
  discoverSubnameRecreation: vi.fn(),
  assertSupportedSubnameMigration: mocks.impactCheck,
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: mocks.query,
  useQueryClient: () => mocks.queryClient,
}))
vi.mock('@/lib/wagmi', async () => ({
  publicClient: {},
  sepoliaWithEns: (await import('@/config')).chain,
}))
vi.mock('wagmi', () => ({
  usePublicClient: mocks.client,
  useCapabilities: () => ({ data: undefined }),
  useConnection: () => ({}),
}))
vi.mock('./useMigrationPreflight', () => ({
  useMigrationPreflight: () => ({ ensure: mocks.preflight }),
}))
vi.mock('./useMigrationRecoverySnapshot', () => ({
  useMigrationRecoverySnapshot: mocks.recovery,
}))
vi.mock('../service/buildMigrationPlan', () => ({
  buildMigrationPlan: mocks.plan,
  buildMigrationRecoveryPlan: mocks.recoveryPlan,
  MigrationRecoveryPlanError: class extends Error {
    constructor(params: { message: string }) {
      super(params.message)
      this.name = 'MigrationRecoveryPlanError'
    }
  },
}))
vi.mock('../service/estimateMigrationGasCost', () => ({
  estimateMigrationGasCost: mocks.estimate,
}))

const OWNER: Address = '0x0000000000000000000000000000000000000001'
const HCA: Address = '0x0000000000000000000000000000000000000002'
const domain = makeDomain({ id: '0x01', name: 'alice.eth' })
const params: Parameters<typeof useMigrationGasEstimate>[0] = {
  ownerAddress: OWNER,
  hcaAddress: HCA,
  selectedNames: [domain.name],
  v1Names: [domain] as Parameters<typeof useMigrationGasEstimate>[0]['v1Names'],
}
const noRecreation = (): Awaited<
  ReturnType<typeof discoverSubnameRecreation>
> => ({
  domains: [domain],
  inventory: makeRpcSubnameInventory({
    domains: [domain],
    rootNames: [domain.name],
  }),
  snapshot: {
    version: 5,
    roots: [],
    names: [domain.name],
    blockNumber: '1',
    blockHash: zeroHash,
    timestamp: '1',
  },
  unrecoverable: [],
})
const invokeQuery = () => {
  const options = mocks.query.mock.lastCall?.[0] as {
    queryFn: (context: { signal: AbortSignal }) => Promise<unknown>
  }
  return options.queryFn({ signal: new AbortController().signal })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(discoverSubnameRecreation).mockResolvedValue(noRecreation())
  mocks.client.mockReturnValue({})
  mocks.query.mockReturnValue({ isPending: true })
  mocks.recovery.mockReturnValue(null)
  mocks.preflight.mockResolvedValue({})
  mocks.impactCheck.mockResolvedValue(undefined)
  mocks.plan.mockResolvedValue({})
  mocks.recoveryPlan.mockResolvedValue({})
  mocks.estimate.mockResolvedValue({
    status: 'ready',
    gasUnits: 1n,
    feeWei: 2n,
    transactionCount: 1,
  })
})
afterEach(() => vi.restoreAllMocks())

it('starts parent preflight while independent child discovery is still pending', async () => {
  let release = (
    _value: Awaited<ReturnType<typeof discoverSubnameRecreation>>,
  ): void => {}
  const discovery = new Promise<
    Awaited<ReturnType<typeof discoverSubnameRecreation>>
  >((resolve) => {
    release = resolve
  })
  vi.mocked(discoverSubnameRecreation).mockReturnValueOnce(discovery)
  renderHook(() => useMigrationGasEstimate(params))
  const pending = invokeQuery()
  await vi.waitFor(() =>
    expect(discoverSubnameRecreation).toHaveBeenCalledTimes(1),
  )
  try {
    expect(mocks.preflight).toHaveBeenCalledTimes(1)
  } finally {
    release(noRecreation())
    await pending
  }
})

it('starts the fee lookup while the independent final impact check is pending', async () => {
  let release = (): void => {}
  const impact = new Promise<void>((resolve) => {
    release = resolve
  })
  mocks.impactCheck.mockReturnValueOnce(impact)
  renderHook(() => useMigrationGasEstimate(params))
  const pending = invokeQuery()
  await vi.waitFor(() => expect(mocks.impactCheck).toHaveBeenCalledTimes(1))
  try {
    expect(mocks.estimate).toHaveBeenCalledTimes(1)
  } finally {
    release()
    await pending
  }
})

it('publishes the actual verified plan impact before displaying the gas estimate', async () => {
  const classified = [makeClassified({ name: domain.name })]
  const checkedAt = Date.now()
  const impact = {
    parents: [],
    affectedCount: 0,
    fingerprint: 'verified-plan',
    checkedAt,
  }
  mocks.plan.mockResolvedValue({ classified })
  mocks.impactCheck.mockResolvedValue(impact)
  renderHook(() => useMigrationGasEstimate(params))
  await invokeQuery()
  const expectedKey = getSubnameMigrationImpactQueryOptions({
    ownerAddress: OWNER,
    chainId: chain.id,
    migratingNames: [domain.name],
    copiedNames: [],
    renewingNames: [],
    isEnabled: true,
    isPrepared: true,
    hasSelectedNames: true,
  }).queryKey
  const inventoryKey = getRpcSubnameInventoryCacheKey({
    ownerAddress: OWNER,
    chainId: chain.id,
    registryAddress: V1_CONTRACTS.LegacyRegistry,
    nameWrapperAddress: V1_CONTRACTS.NameWrapper,
  })
  expect(mocks.queryClient.setQueryData.mock.calls).toEqual([
    [inventoryKey, noRecreation().inventory],
    [expectedKey, impact, { updatedAt: checkedAt }],
  ])
})

it.each([
  { field: 'V1 manager', changed: { ...domain, owner: { id: HCA } } },
  {
    field: 'V1 resolver',
    changed: { ...domain, resolver: { address: HCA } },
  },
])('rebuilds the plan when a refresh changes the $field', ({ changed }) => {
  const lastKey = () => {
    const [options] = mocks.query.mock.lastCall ?? []
    return (options as { readonly queryKey?: unknown } | undefined)?.queryKey
  }
  const { rerender } = renderHook(
    (props: Parameters<typeof useMigrationGasEstimate>[0]) =>
      useMigrationGasEstimate(props),
    { initialProps: params },
  )
  const before = lastKey()
  rerender({ ...params, v1Names: [changed] })
  expect(lastKey()).not.toEqual(before)
})

describe('useMigrationGasEstimate failure stages', () => {
  it('recovers from a transient preflight failure with one fresh preparation attempt', async () => {
    mocks.preflight.mockRejectedValueOnce(
      new TimeoutError({ url: 'https://rpc.example', body: {} }),
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, retryDelay: 0 } },
    })
    let preparation: Promise<unknown> = Promise.resolve()
    mocks.query.mockImplementationOnce((options: FetchQueryOptions) => {
      preparation = queryClient.fetchQuery(options)
      return { isPending: true }
    })
    const { unmount } = renderHook(() => useMigrationGasEstimate(params))
    try {
      await act(async () => {
        await expect(preparation).resolves.toMatchObject({
          estimate: { feeWei: 2n, gasUnits: 1n, transactionCount: 1 },
        })
      })
      expect(mocks.preflight).toHaveBeenCalledTimes(2)
      expect(mocks.plan).toHaveBeenCalledTimes(1)
    } finally {
      unmount()
      queryClient.clear()
    }
  })

  it.each([
    { stage: 'preflight', reason: 'missing-wrapper' },
    { stage: 'plan', reason: 'conflicting-wrapper' },
  ] as const)(
    'stops after one preparation attempt for a $stage $reason failure',
    async ({ stage, reason }) => {
      const cause = new DirectMigrationRouteError({
        message: 'Parent wrapper is unavailable',
        reason,
        ensName: 'ethereumclub.eth',
      })
      const operation = stage === 'preflight' ? mocks.preflight : mocks.plan
      operation.mockRejectedValue(cause)
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: 1, retryDelay: 0 } },
      })
      let preparation: Promise<unknown> = Promise.resolve()
      mocks.query.mockImplementationOnce((options: FetchQueryOptions) => {
        preparation = queryClient.fetchQuery(options)
        return { isPending: true }
      })
      const { unmount } = renderHook(() => useMigrationGasEstimate(params))
      try {
        await act(async () => {
          await expect(preparation).rejects.toMatchObject({ cause })
        })
        expect(operation).toHaveBeenCalledTimes(1)
        expect(mocks.estimate).not.toHaveBeenCalled()
      } finally {
        unmount()
        queryClient.clear()
      }
    },
  )

  it.each(['preflight', 'plan', 'fee'] as const)(
    'preserves a %s failure from the actual estimate pipeline',
    async (stage) => {
      const cause = Object.assign(new Error('private RPC payload'), {
        name: 'HttpRequestError',
      })
      if (stage === 'preflight') mocks.preflight.mockRejectedValue(cause)
      if (stage === 'plan') mocks.plan.mockRejectedValue(cause)
      if (stage === 'fee')
        mocks.estimate.mockResolvedValue({ status: 'error', error: cause })
      const { result, rerender, unmount } = renderHook(() =>
        useMigrationGasEstimate(params),
      )
      const error = await invokeQuery().catch((error: unknown) => error)
      mocks.query.mockReturnValue({ isError: true, error })
      rerender()
      expect(result.current).toEqual({
        status: 'error',
        stage,
        cause,
        reason: stage === 'fee' ? 'fee-unavailable' : 'rpc-unavailable',
      })
      if (stage === 'preflight') expect(mocks.plan).not.toHaveBeenCalled()
      if (stage !== 'fee') expect(mocks.estimate).not.toHaveBeenCalled()
      unmount()
    },
  )

  it('identifies recovery failures without rerunning initial preflight', async () => {
    mocks.recovery.mockReturnValue({
      registryDomains: [domain],
      remainingOperations: [{ name: domain.name, action: 'migrate' }],
    })
    const cause = Object.assign(new Error('changed'), {
      name: 'MigrationRecoveryPlanError',
    })
    mocks.recoveryPlan.mockRejectedValue(cause)
    const { unmount } = renderHook(() => useMigrationGasEstimate(params))
    const error = await invokeQuery().catch((error: unknown) => error)
    expect(migrationPreparationFailure(error)).toEqual({
      stage: 'recovery',
      reason: 'recovery-changed',
      cause,
    })
    expect(mocks.preflight).not.toHaveBeenCalled()
    expect(mocks.estimate).not.toHaveBeenCalled()
    unmount()
  })

  it('does not expose raw account setup errors', () => {
    const cause = 'raw account error with RPC URL'
    const { result, unmount } = renderHook(() =>
      useMigrationGasEstimate({
        ...params,
        hcaAddress: undefined,
        accountError: cause,
      }),
    )
    expect(result.current).toEqual({
      status: 'error',
      stage: 'account',
      reason: 'account-unavailable',
      cause,
    })
    unmount()
  })
})
