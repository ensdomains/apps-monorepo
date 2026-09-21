import { renderHook } from '@testing-library/react'
import type { Address } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeDomain } from '../service/_fixtures'
import { migrationPreparationFailure } from '../service/migrationPreparationError'
import { useMigrationGasEstimate } from './useMigrationGasEstimate'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  client: vi.fn(),
  preflight: vi.fn(),
  plan: vi.fn(),
  recoveryPlan: vi.fn(),
  estimate: vi.fn(),
  recovery: vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.query }))
vi.mock('wagmi', () => ({ usePublicClient: mocks.client }))
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
const invokeQuery = () => {
  const options = mocks.query.mock.lastCall?.[0] as {
    queryFn: (context: { signal: AbortSignal }) => Promise<unknown>
  }
  return options.queryFn({ signal: new AbortController().signal })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.client.mockReturnValue({})
  mocks.query.mockReturnValue({ isPending: true })
  mocks.recovery.mockReturnValue(null)
  mocks.preflight.mockResolvedValue({})
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

describe('useMigrationGasEstimate failure stages', () => {
  it.each([
    'preflight',
    'plan',
    'fee',
  ] as const)('preserves a %s failure from the actual estimate pipeline', async (stage) => {
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
  })

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
