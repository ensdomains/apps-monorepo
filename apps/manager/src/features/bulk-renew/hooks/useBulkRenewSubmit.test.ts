// biome-ignore-all lint/suspicious/noExplicitAny: test fixtures use loose typing
import { HcaFundingDeclinedError } from '@ens-apps/transaction-manager'
import { act, renderHook } from '@testing-library/react'
import { errAsync, okAsync, ResultAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { envConfig } from '@/config'
import type { RenewItem } from '../types'

// Mocked transaction-manager actors, the renew intent service, and app
// singletons. Declared via vi.hoisted so the vi.mock factories below can
// reference them.
const mocks = vi.hoisted(() => ({
  pollTransactionStatusActor: vi.fn(),
  readPaymentTokenAllowanceActor: vi.fn(),
  submitApprovalActor: vi.fn(),
  submitRenewActor: vi.fn(),
  submitHcaRenewal: vi.fn(),
  getExpiry: vi.fn(),
  useSmartAccountContext: vi.fn(),
  useRenewalSigner: vi.fn(),
  useHcaFundingPrompt: vi.fn(),
  invalidateQueries: vi.fn(),
}))

// The hook imports the decline error from the package root, whose barrel pulls
// in the registration machine. Stub just that binding so the harness doesn't
// have to load the whole package for a `instanceof` check.
vi.mock('@ens-apps/transaction-manager', () => ({
  HcaFundingDeclinedError: class HcaFundingDeclinedError extends Error {
    constructor() {
      super('Funding was not approved, so no signature was requested.')
      this.name = 'HcaFundingDeclinedError'
    }
  },
}))

vi.mock(
  '@ens-apps/transaction-manager/machines/registration/registration.actors',
  () => ({
    pollTransactionStatusActor: mocks.pollTransactionStatusActor,
    readPaymentTokenAllowanceActor: mocks.readPaymentTokenAllowanceActor,
    submitApprovalActor: mocks.submitApprovalActor,
    submitRenewActor: mocks.submitRenewActor,
  }),
)
// The intent service is the smart-account route's whole I/O surface: it quotes,
// funds and submits, and resolves once the fill has landed.
vi.mock('@/features/renew/service/hcaRenewal', () => ({
  HCA_RENEWAL_INTENT_MAX_ITEMS: 25,
  submitHcaRenewal: mocks.submitHcaRenewal,
}))
vi.mock('@/features/profile/service/profileExpiry', () => ({
  getExpiry: mocks.getExpiry,
}))
vi.mock('@/lib/wagmi', () => ({ publicClient: {} }))
vi.mock('@/utils/router/root-context', () => ({
  getQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))
vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: mocks.useSmartAccountContext,
  useHcaFundingPrompt: mocks.useHcaFundingPrompt,
}))
vi.mock('@/features/renew/hooks/useRenewalSigner', () => ({
  useRenewalSigner: mocks.useRenewalSigner,
}))

import {
  ACCOUNT_LOADING_MESSAGE,
  RENEWED_CHECK_FAILED_MESSAGE,
  useBulkRenewSubmit,
  WALLET_REQUIRED_MESSAGE,
} from './useBulkRenewSubmit'

const EOA = '0x2222222222222222222222222222222222222222' as const
const HCA = '0x1111111111111111111111111111111111111111' as const

const walletClient = { account: { address: EOA } }

/** Smart-account mode: the renewal runs as an owner-signed intent on the HCA. */
const hcaAccount = {
  signer: { type: 'rhinestone' },
  ownerAddress: EOA,
  accountAddress: HCA,
  walletClient,
} as any
/** EOA-only mode: no HCA, so the wallet route submits and pays. */
const eoaAccount = {
  signer: { type: 'eoa', walletClient },
  ownerAddress: EOA,
  accountAddress: EOA,
  walletClient,
} as any
const disconnected = {
  signer: null,
  ownerAddress: null,
  accountAddress: null,
  walletClient: null,
} as any

const CURRENT_EXPIRY = 1_800_000_000n

const items = (labels: string[]): RenewItem[] =>
  labels.map((label) => ({
    label,
    duration: 31_557_600n,
    currentExpiry: CURRENT_EXPIRY,
  }))

/** What the chain reports for every name's expiry. */
const expiryOnChain = (expiry: bigint) =>
  okAsync({ expiry, isNonExpiring: false, protocol: 'v2' })

const args = {
  items: items(['one', 'two', 'three']),
  token: 'USDC' as const,
  sumPriceRaw: 3_000_000n,
}

const renewedLabels = () =>
  mocks.submitRenewActor.mock.calls.map((call) => call[0]?.label)

/** Labels passed to each intent the hook submitted, in order. */
const intentLabels = () =>
  mocks.submitHcaRenewal.mock.calls.map((call) =>
    call[0].items.map((item: RenewItem) => item.label),
  )

beforeEach(() => {
  vi.clearAllMocks()
  mocks.pollTransactionStatusActor.mockReturnValue(okAsync(undefined))
  mocks.readPaymentTokenAllowanceActor.mockReturnValue(okAsync(0n))
  mocks.submitApprovalActor.mockReturnValue(okAsync('approval-tx'))
  mocks.submitRenewActor.mockReturnValue(okAsync('renew-tx'))
  mocks.submitHcaRenewal.mockResolvedValue({
    txId: 'intent-tx',
    quotedFeeUsdc: 1_000_000n,
  })
  mocks.getExpiry.mockReturnValue(expiryOnChain(CURRENT_EXPIRY))
  mocks.useSmartAccountContext.mockReturnValue(hcaAccount)
  // Any wallet but a Safe renews with the account's own signer.
  mocks.useRenewalSigner.mockImplementation(
    () => mocks.useSmartAccountContext().signer,
  )
  mocks.useHcaFundingPrompt.mockReturnValue({
    prompt: null,
    confirmFunding: vi.fn(),
    approve: vi.fn(),
    decline: vi.fn(),
  })
})

describe('useBulkRenewSubmit (smart account)', () => {
  it('fails fast when no wallet is connected', async () => {
    mocks.useSmartAccountContext.mockReturnValue(disconnected)
    const { result } = renderHook(() => useBulkRenewSubmit())

    await act(async () => {
      await result.current.submit(args)
    })

    expect(result.current.phase).toBe('error')
    expect(result.current.errorMessage).toBe(WALLET_REQUIRED_MESSAGE)
    expect(mocks.submitHcaRenewal).not.toHaveBeenCalled()
    expect(mocks.submitRenewActor).not.toHaveBeenCalled()
  })

  it('never falls back to the gas-paying wallet route while the HCA initializes', async () => {
    // The wallet is connected, but the rhinestone signer isn't built yet.
    mocks.useSmartAccountContext.mockReturnValue({
      ...hcaAccount,
      signer: null,
    })
    const { result } = renderHook(() => useBulkRenewSubmit())

    await act(async () => {
      await result.current.submit(args)
    })

    expect(result.current.phase).toBe('error')
    expect(result.current.errorMessage).toBe(ACCOUNT_LOADING_MESSAGE)
    expect(mocks.submitHcaRenewal).not.toHaveBeenCalled()
    expect(mocks.submitApprovalActor).not.toHaveBeenCalled()
    expect(mocks.submitRenewActor).not.toHaveBeenCalled()
  })

  it('renews the whole selection in one intent, with no approve transaction', async () => {
    const { result } = renderHook(() => useBulkRenewSubmit())

    await act(async () => {
      await result.current.submit(args)
    })

    expect(result.current.phase).toBe('success')
    expect(intentLabels()).toEqual([['one', 'two', 'three']])
    // The intent funds its own rent (permit/transferFrom inside the batch), so
    // nothing goes through the wallet-route actors.
    expect(mocks.readPaymentTokenAllowanceActor).not.toHaveBeenCalled()
    expect(mocks.submitApprovalActor).not.toHaveBeenCalled()
    expect(mocks.submitRenewActor).not.toHaveBeenCalled()
    expect(result.current.statuses).toEqual({
      one: 'done',
      two: 'done',
      three: 'done',
    })
    expect(mocks.invalidateQueries).toHaveBeenCalled()
    // Nothing has failed yet, so nothing needs re-reading.
    expect(mocks.getExpiry).not.toHaveBeenCalled()
  })

  it('renews against the canonical v2 registrar with the connected owner', async () => {
    const { result } = renderHook(() => useBulkRenewSubmit())

    await act(async () => {
      await result.current.submit(args)
    })

    const input = mocks.submitHcaRenewal.mock.calls[0]?.[0]
    expect(input.renewerAddress).toBe(
      envConfig.chain.contracts.ensEthRegistrar.address,
    )
    expect(input.protocol).toBe('v2')
    expect(input.ownerAddress).toBe(EOA)
    expect(input.signer.type).toBe('rhinestone')
    // The configured network, never a fallback chain.
    expect(input.chainId).toBe(envConfig.chain.id)
  })

  it('does not charge again for a chunk that renewed but failed its wait', async () => {
    // The fill landed but the wait errored, so the run never recorded it.
    mocks.submitHcaRenewal.mockRejectedValueOnce(
      new Error('Timed out waiting for the intent'),
    )
    const { result } = renderHook(() => useBulkRenewSubmit())
    await act(async () => {
      await result.current.submit(args)
    })
    expect(result.current.phase).toBe('error')

    mocks.getExpiry.mockReturnValue(expiryOnChain(CURRENT_EXPIRY + 31_557_600n))
    await act(async () => {
      await result.current.submit(args)
    })

    expect(result.current.phase).toBe('success')
    expect(mocks.submitHcaRenewal).toHaveBeenCalledOnce()
    expect(result.current.statuses).toEqual({
      one: 'done',
      two: 'done',
      three: 'done',
    })
  })

  it('refuses to retry when it cannot tell what already renewed', async () => {
    mocks.submitHcaRenewal.mockRejectedValueOnce(
      new Error('Timed out waiting for the intent'),
    )
    const { result } = renderHook(() => useBulkRenewSubmit())
    await act(async () => {
      await result.current.submit(args)
    })

    mocks.getExpiry.mockReturnValue(errAsync(new Error('rpc down')))
    await act(async () => {
      await result.current.submit(args)
    })

    expect(result.current.phase).toBe('error')
    expect(result.current.errorMessage).toBe(RENEWED_CHECK_FAILED_MESSAGE)
    expect(mocks.submitHcaRenewal).toHaveBeenCalledOnce()
  })

  it('splits a large selection into one intent per chunk', async () => {
    const many = items(Array.from({ length: 26 }, (_, i) => `name${i}`))
    const { result } = renderHook(() => useBulkRenewSubmit())

    await act(async () => {
      await result.current.submit({ ...args, items: many })
    })

    expect(result.current.phase).toBe('success')
    expect(intentLabels().map((labels) => labels.length)).toEqual([25, 1])
  })

  it('surfaces a failed intent and resumes after the chunks that landed', async () => {
    const many = items(Array.from({ length: 26 }, (_, i) => `name${i}`))
    mocks.submitHcaRenewal
      .mockResolvedValueOnce({ txId: 'intent-1', quotedFeeUsdc: 1_000_000n })
      .mockRejectedValueOnce(new Error('The intent could not be filled'))
      .mockResolvedValueOnce({ txId: 'intent-3', quotedFeeUsdc: 1_000_000n })

    const { result } = renderHook(() => useBulkRenewSubmit())
    await act(async () => {
      await result.current.submit({ ...args, items: many })
    })

    expect(result.current.phase).toBe('error')
    expect(result.current.errorMessage).toBe('The intent could not be filled')
    // The first chunk really did renew on-chain, so its names are done and the
    // failed chunk's names are marked.
    expect(result.current.statuses.name0).toBe('done')
    expect(result.current.statuses.name25).toBe('error')

    await act(async () => {
      await result.current.submit({ ...args, items: many })
    })

    expect(result.current.phase).toBe('success')
    // Chunk 1 is NOT paid for a second time.
    expect(intentLabels().map((labels) => labels.length)).toEqual([25, 1, 1])
  })

  it('returns to idle when the funding prompt is declined', async () => {
    mocks.submitHcaRenewal.mockRejectedValue(new HcaFundingDeclinedError())
    const { result } = renderHook(() => useBulkRenewSubmit())

    await act(async () => {
      await result.current.submit(args)
    })

    // Nothing was signed and nothing was spent: no error, and the names are
    // still pending rather than failed.
    expect(result.current.phase).toBe('idle')
    expect(result.current.errorMessage).toBeUndefined()
    expect(result.current.statuses).toEqual({
      one: 'pending',
      two: 'pending',
      three: 'pending',
    })
  })

  it('ignores a stale submission after the dialog is reset mid-flight', async () => {
    // Gate the intent so we can reset while it is in-flight.
    let releaseIntent: () => void = () => {}
    mocks.submitHcaRenewal.mockReturnValue(
      new Promise((resolve) => {
        releaseIntent = () =>
          resolve({ txId: 'intent-tx', quotedFeeUsdc: 1_000_000n })
      }),
    )
    const { result } = renderHook(() => useBulkRenewSubmit())

    let submitPromise!: Promise<void>
    await act(async () => {
      submitPromise = result.current.submit(args)
      // Flush pre-intent microtasks so we park on the gated submission.
      for (let i = 0; i < 10; i++) await Promise.resolve()
    })
    expect(result.current.phase).toBe('renewing')

    act(() => {
      result.current.reset()
    })
    expect(result.current.phase).toBe('idle')

    await act(async () => {
      releaseIntent()
      await submitPromise
    })
    expect(result.current.phase).toBe('idle')
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

describe('useBulkRenewSubmit (Safe{Wallet})', () => {
  it('renews from the Safe with its connector, never through the HCA it cannot sign for', async () => {
    // The account context still builds an HCA signer for a Safe owner.
    const safeSigner = {
      type: 'eoa',
      walletClient,
      connector: { id: 'walletConnect' },
    }
    mocks.useRenewalSigner.mockReturnValue(safeSigner)
    const { result } = renderHook(() => useBulkRenewSubmit())

    await act(async () => {
      await result.current.submit(args)
    })

    expect(result.current.phase).toBe('success')
    expect(mocks.submitHcaRenewal).not.toHaveBeenCalled()
    expect(mocks.submitApprovalActor.mock.calls[0]?.[0]?.signer).toBe(
      safeSigner,
    )
    expect(
      mocks.submitRenewActor.mock.calls.map((call) => call[0]?.signer),
    ).toEqual([safeSigner, safeSigner, safeSigner])
  })
})

describe('useBulkRenewSubmit (EOA only)', () => {
  beforeEach(() => {
    mocks.useSmartAccountContext.mockReturnValue(eoaAccount)
  })

  it('approves the summed price once, then renews each name in its own tx', async () => {
    const { result } = renderHook(() => useBulkRenewSubmit())

    await act(async () => {
      await result.current.submit(args)
    })

    expect(result.current.phase).toBe('success')
    // One approve for the whole batch — the per-name renews share the allowance.
    expect(mocks.submitApprovalActor).toHaveBeenCalledTimes(1)
    expect(mocks.submitApprovalActor.mock.calls[0]?.[0]?.tokenPrice).toBe(
      3_000_000n,
    )
    expect(renewedLabels()).toEqual(['one', 'two', 'three'])
    expect(mocks.submitHcaRenewal).not.toHaveBeenCalled()
    expect(mocks.invalidateQueries).toHaveBeenCalled()
  })

  it('renews from the connected wallet, never through the HCA', async () => {
    // Without an HCA there is no intent route: `AbstractETHRegistrar.renew`
    // charges `msg.sender`, so the EOA must be both the sender and the payer.
    const { result } = renderHook(() => useBulkRenewSubmit())

    await act(async () => {
      await result.current.submit(args)
    })

    for (const call of mocks.submitRenewActor.mock.calls) {
      expect(call[0]?.signer?.type).toBe('eoa')
    }
    expect(mocks.submitApprovalActor.mock.calls[0]?.[0]?.signer?.type).toBe(
      'eoa',
    )
  })

  it('authorizes against the canonical registrar, not a separate deployment', async () => {
    // Regression guard, inverted from what it used to assert: renewal must leave
    // the registrar and token to the actors' own canonical defaults. Overriding
    // them with the standalone-HCA deployment approved -- and renewed on -- a
    // registrar that had never registered the name, which reverts
    // `NameNotRenewable(label)`.
    const { result } = renderHook(() => useBulkRenewSubmit())

    await act(async () => {
      await result.current.submit(args)
    })

    for (const mock of [
      mocks.readPaymentTokenAllowanceActor,
      mocks.submitApprovalActor,
    ]) {
      const arg = mock.mock.calls[0]?.[0]
      expect(arg?.registrarAddress).toBeUndefined()
      expect(arg?.paymentTokenAddress).toBeUndefined()
    }
  })

  it('reads the allowance for the connected wallet, not the HCA', async () => {
    const { result } = renderHook(() => useBulkRenewSubmit())

    await act(async () => {
      await result.current.submit(args)
    })

    expect(mocks.readPaymentTokenAllowanceActor.mock.calls[0]?.[0]?.owner).toBe(
      EOA,
    )
  })

  it('skips approval when the allowance already covers the batch', async () => {
    mocks.readPaymentTokenAllowanceActor.mockReturnValue(okAsync(9_999_999n))
    const { result } = renderHook(() => useBulkRenewSubmit())

    await act(async () => {
      await result.current.submit(args)
    })

    expect(mocks.submitApprovalActor).not.toHaveBeenCalled()
    expect(renewedLabels()).toEqual(['one', 'two', 'three'])
  })

  it('resumes from the first failure instead of re-paying for renewed names', async () => {
    // Sequential renewals are NOT atomic: names before the failure really did
    // renew on-chain, so a retry must skip them.
    mocks.readPaymentTokenAllowanceActor.mockReturnValue(okAsync(9_999_999n))
    mocks.submitRenewActor
      .mockReturnValueOnce(okAsync('renew-one'))
      .mockReturnValueOnce(errAsync(new Error('boom')))
    const { result } = renderHook(() => useBulkRenewSubmit())

    await act(async () => {
      await result.current.submit(args)
    })
    expect(result.current.phase).toBe('error')
    expect(result.current.statuses.one).toBe('done')
    expect(renewedLabels()).toEqual(['one', 'two'])

    await act(async () => {
      await result.current.submit(args)
    })
    expect(result.current.phase).toBe('success')
    // 'one' is not renewed (or paid for) a second time.
    expect(renewedLabels()).toEqual(['one', 'two', 'two', 'three'])
  })

  it('ignores a stale submission after the dialog is reset mid-flight', async () => {
    mocks.readPaymentTokenAllowanceActor.mockReturnValue(okAsync(9_999_999n))
    // Gate the first renewal's confirmation so we can reset while it's in-flight.
    let releaseRenew: () => void = () => {}
    mocks.pollTransactionStatusActor.mockReturnValue(
      ResultAsync.fromSafePromise(
        new Promise<void>((resolve) => {
          releaseRenew = resolve
        }),
      ),
    )
    const { result } = renderHook(() => useBulkRenewSubmit())

    let submitPromise!: Promise<void>
    await act(async () => {
      submitPromise = result.current.submit(args)
      // Flush pre-renew microtasks so we park at the gated confirmation.
      for (let i = 0; i < 10; i++) await Promise.resolve()
    })
    expect(result.current.phase).toBe('renewing')

    // User closes and reopens the dialog — its effect calls reset().
    act(() => {
      result.current.reset()
    })
    expect(result.current.phase).toBe('idle')

    // The in-flight renewal now confirms; it must NOT flip the reset dialog to
    // 'success' — the run is stale.
    await act(async () => {
      releaseRenew()
      await submitPromise
    })
    expect(result.current.phase).toBe('idle')
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

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useSearch: () => ({ referrer: '0x1234' }),
}))

it.each(['eoa', 'hca'] as const)(
  'passes URL attribution into each %s bulk renewal',
  async (mode) => {
    mocks.useSmartAccountContext.mockReturnValue(
      mode === 'eoa' ? eoaAccount : hcaAccount,
    )
    const { result } = renderHook(() => useBulkRenewSubmit())
    await act(async () => {
      await result.current.submit(args)
    })
    const expected = `0x${'0'.repeat(60)}1234`
    if (mode === 'eoa') {
      expect(mocks.submitRenewActor).toHaveBeenCalledTimes(args.items.length)
      for (const [input] of mocks.submitRenewActor.mock.calls)
        expect(input.referrer).toBe(expected)
    } else {
      expect(mocks.submitHcaRenewal).toHaveBeenCalledOnce()
      expect(mocks.submitHcaRenewal.mock.calls[0]?.[0].items).toEqual(
        args.items.map((item) => ({ ...item, referrer: expected })),
      )
    }
  },
)
