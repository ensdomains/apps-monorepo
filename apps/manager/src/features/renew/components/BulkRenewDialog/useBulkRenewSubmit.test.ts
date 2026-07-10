// biome-ignore-all lint/suspicious/noExplicitAny: test fixtures use loose typing
import { act, renderHook } from '@testing-library/react'
import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RenewItem } from './types'

// Mocked transaction-manager actors + app singletons. Declared via vi.hoisted so
// the vi.mock factories below can reference them.
const mocks = vi.hoisted(() => ({
  ensureHcaDeployedActor: vi.fn(),
  pollTransactionStatusActor: vi.fn(),
  readPaymentTokenAllowanceActor: vi.fn(),
  signPermitActor: vi.fn(),
  submitApprovalActor: vi.fn(),
  submitPermitAndRenewActor: vi.fn(),
  submitRenewActor: vi.fn(),
  useSmartAccountContext: vi.fn(),
  invalidateQueries: vi.fn(),
}))

vi.mock(
  '@ens-apps/transaction-manager/machines/registration/registration.actors',
  () => ({
    authorizedPaymentAmount: (value: bigint) => value + value / 10n,
    ensureHcaDeployedActor: mocks.ensureHcaDeployedActor,
    pollTransactionStatusActor: mocks.pollTransactionStatusActor,
    readPaymentTokenAllowanceActor: mocks.readPaymentTokenAllowanceActor,
    signPermitActor: mocks.signPermitActor,
    submitApprovalActor: mocks.submitApprovalActor,
    submitPermitAndRenewActor: mocks.submitPermitAndRenewActor,
    submitRenewActor: mocks.submitRenewActor,
  }),
)
vi.mock('@/lib/wagmi', () => ({ publicClient: {} }))
vi.mock('@/utils/router/root-context', () => ({
  getQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))
vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: mocks.useSmartAccountContext,
}))

import { useBulkRenewSubmit } from './useBulkRenewSubmit'

const EOA = '0x2222222222222222222222222222222222222222' as const
const HCA = '0x1111111111111111111111111111111111111111' as const
const PERMIT = { owner: EOA, spender: EOA, value: 0n, deadline: 0n } as any

const hcaAccount = {
  signer: { type: 'rhinestone' },
  ownerAddress: EOA,
  accountAddress: HCA,
  walletClient: {},
} as any
const eoaAccount = {
  signer: { type: 'eoa', walletClient: {} },
  ownerAddress: EOA,
  accountAddress: EOA,
  walletClient: {},
} as any
const disconnected = {
  signer: null,
  ownerAddress: null,
  accountAddress: null,
  walletClient: null,
} as any

const items = (labels: string[]): RenewItem[] =>
  labels.map((label) => ({ label, duration: 31_557_600n }))

const args = {
  items: items(['one', 'two', 'three']),
  token: 'USDC' as const,
  sumPriceRaw: 3_000_000n,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.ensureHcaDeployedActor.mockReturnValue(okAsync(undefined))
  mocks.pollTransactionStatusActor.mockReturnValue(okAsync(undefined))
  mocks.readPaymentTokenAllowanceActor.mockReturnValue(okAsync(0n))
  mocks.signPermitActor.mockReturnValue(okAsync(PERMIT))
  mocks.submitApprovalActor.mockReturnValue(okAsync('approval-tx'))
  mocks.submitPermitAndRenewActor.mockReturnValue(okAsync('permit-renew-tx'))
  mocks.submitRenewActor.mockReturnValue(okAsync('renew-tx'))
  mocks.useSmartAccountContext.mockReturnValue(hcaAccount)
})

describe('useBulkRenewSubmit', () => {
  it('fails fast when the wallet is not connected', async () => {
    mocks.useSmartAccountContext.mockReturnValue(disconnected)
    const { result } = renderHook(() => useBulkRenewSubmit())

    await act(async () => {
      await result.current.submit(args)
    })

    expect(result.current.phase).toBe('error')
    expect(result.current.errorMessage).toBe('Wallet not connected')
    expect(mocks.submitRenewActor).not.toHaveBeenCalled()
  })

  it('HCA path: one permit bundled with the first renew, plain renews the rest', async () => {
    const { result } = renderHook(() => useBulkRenewSubmit())

    await act(async () => {
      await result.current.submit(args)
    })

    expect(result.current.phase).toBe('success')
    expect(mocks.signPermitActor).toHaveBeenCalledTimes(1)
    expect(mocks.submitPermitAndRenewActor).toHaveBeenCalledTimes(1)
    expect(mocks.submitRenewActor).toHaveBeenCalledTimes(2)
    // Permit sized to the full sum + 10% headroom.
    expect(mocks.signPermitActor.mock.calls[0]?.[0]?.value).toBe(3_300_000n)
    expect(mocks.invalidateQueries).toHaveBeenCalled()
  })

  it('EOA path: approves once, then plain renews without a permit', async () => {
    mocks.useSmartAccountContext.mockReturnValue(eoaAccount)
    const { result } = renderHook(() => useBulkRenewSubmit())

    await act(async () => {
      await result.current.submit(args)
    })

    expect(result.current.phase).toBe('success')
    expect(mocks.submitApprovalActor).toHaveBeenCalledTimes(1)
    expect(mocks.signPermitActor).not.toHaveBeenCalled()
    expect(mocks.submitPermitAndRenewActor).not.toHaveBeenCalled()
    expect(mocks.submitRenewActor).toHaveBeenCalledTimes(3)
  })

  it('skips authorization when the allowance already covers the batch', async () => {
    mocks.readPaymentTokenAllowanceActor.mockReturnValue(okAsync(9_999_999n))
    const { result } = renderHook(() => useBulkRenewSubmit())

    await act(async () => {
      await result.current.submit(args)
    })

    expect(mocks.signPermitActor).not.toHaveBeenCalled()
    expect(mocks.submitApprovalActor).not.toHaveBeenCalled()
    expect(mocks.submitRenewActor).toHaveBeenCalledTimes(3)
  })

  it('a retry resumes only the names that had not renewed', async () => {
    // Sufficient allowance → all plain renews, no permit.
    mocks.readPaymentTokenAllowanceActor.mockReturnValue(okAsync(9_999_999n))
    mocks.submitRenewActor.mockImplementation(({ label }: any) =>
      label === 'two' ? errAsync(new Error('boom')) : okAsync('renew-tx'),
    )
    const { result } = renderHook(() => useBulkRenewSubmit())

    await act(async () => {
      await result.current.submit(args)
    })
    expect(result.current.phase).toBe('error')
    expect(result.current.statuses.one).toBe('done')
    expect(result.current.statuses.two).toBe('error')

    // Retry — everything succeeds now.
    mocks.submitRenewActor.mockReturnValue(okAsync('renew-tx'))
    const before = mocks.submitRenewActor.mock.calls.length
    await act(async () => {
      await result.current.submit(args)
    })

    expect(result.current.phase).toBe('success')
    const retried = mocks.submitRenewActor.mock.calls
      .slice(before)
      .map((call) => call[0].label)
    expect(retried).toEqual(['two', 'three']) // 'one' is not renewed again
  })

  it('reset() clears status and returns to idle', async () => {
    const { result } = renderHook(() => useBulkRenewSubmit())
    await act(async () => {
      await result.current.submit(args)
    })

    act(() => {
      result.current.reset()
    })

    expect(result.current.phase).toBe('idle')
    expect(result.current.statuses).toEqual({})
  })
})
