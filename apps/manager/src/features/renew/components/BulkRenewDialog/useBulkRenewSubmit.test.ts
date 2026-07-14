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
  submitBatchRenewActor: vi.fn(),
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
    submitBatchRenewActor: mocks.submitBatchRenewActor,
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

import {
  EOA_UNSUPPORTED_MESSAGE,
  useBulkRenewSubmit,
} from './useBulkRenewSubmit'

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
  mocks.submitBatchRenewActor.mockReturnValue(okAsync('batch-renew-tx'))
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
    expect(mocks.submitBatchRenewActor).not.toHaveBeenCalled()
    expect(mocks.submitRenewActor).not.toHaveBeenCalled()
  })

  it('HCA path: renews the whole batch in one transaction with the permit bundled', async () => {
    const { result } = renderHook(() => useBulkRenewSubmit())

    await act(async () => {
      await result.current.submit(args)
    })

    expect(result.current.phase).toBe('success')
    expect(mocks.signPermitActor).toHaveBeenCalledTimes(1)
    // One transaction for the whole batch — no per-name renews.
    expect(mocks.submitBatchRenewActor).toHaveBeenCalledTimes(1)
    expect(mocks.submitRenewActor).not.toHaveBeenCalled()
    const batchArg = mocks.submitBatchRenewActor.mock.calls[0]?.[0]
    expect(batchArg?.permit).toBe(PERMIT)
    expect(batchArg?.items).toHaveLength(3)
    // Permit sized to the full sum + 10% headroom.
    expect(mocks.signPermitActor.mock.calls[0]?.[0]?.value).toBe(3_300_000n)
    expect(mocks.invalidateQueries).toHaveBeenCalled()
  })

  it('EOA mode is unsupported: refuses without submitting any transaction', async () => {
    mocks.useSmartAccountContext.mockReturnValue(eoaAccount)
    const { result } = renderHook(() => useBulkRenewSubmit())

    await act(async () => {
      await result.current.submit(args)
    })

    expect(result.current.phase).toBe('error')
    expect(result.current.errorMessage).toBe(EOA_UNSUPPORTED_MESSAGE)
    // The one-transaction invariant is enforced before anything is submitted.
    expect(mocks.ensureHcaDeployedActor).not.toHaveBeenCalled()
    expect(mocks.submitApprovalActor).not.toHaveBeenCalled()
    expect(mocks.submitBatchRenewActor).not.toHaveBeenCalled()
    expect(mocks.submitRenewActor).not.toHaveBeenCalled()
  })

  it('HCA: skips authorization when the allowance already covers the batch', async () => {
    mocks.readPaymentTokenAllowanceActor.mockReturnValue(okAsync(9_999_999n))
    const { result } = renderHook(() => useBulkRenewSubmit())

    await act(async () => {
      await result.current.submit(args)
    })

    expect(mocks.signPermitActor).not.toHaveBeenCalled()
    expect(mocks.submitApprovalActor).not.toHaveBeenCalled()
    // Still one batch transaction, just without a permit call bundled in.
    expect(mocks.submitBatchRenewActor).toHaveBeenCalledTimes(1)
    expect(
      mocks.submitBatchRenewActor.mock.calls[0]?.[0]?.permit,
    ).toBeUndefined()
  })

  it('HCA: a failed batch retries the whole batch atomically (no partial resume)', async () => {
    mocks.readPaymentTokenAllowanceActor.mockReturnValue(okAsync(9_999_999n))
    mocks.submitBatchRenewActor.mockReturnValueOnce(errAsync(new Error('boom')))
    const { result } = renderHook(() => useBulkRenewSubmit())

    await act(async () => {
      await result.current.submit(args)
    })
    expect(result.current.phase).toBe('error')

    // Retry — the whole batch (all three names) is resubmitted, since an atomic
    // batch has no per-name completion to resume from.
    await act(async () => {
      await result.current.submit(args)
    })
    expect(result.current.phase).toBe('success')
    expect(
      mocks.submitBatchRenewActor.mock.calls.at(-1)?.[0]?.items,
    ).toHaveLength(3)
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
