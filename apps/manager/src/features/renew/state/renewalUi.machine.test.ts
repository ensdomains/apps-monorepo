import {
  type HcaDisplayedDebit,
  HcaFundingDeclinedError,
} from '@ens-apps/transaction-manager/helpers/hca-intent-funding'
import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createActor, waitFor } from 'xstate'
import type { HcaRenewalL2Funding } from '@/features/renew/service/hcaRenewal'
import { renewalUiMachine } from './renewalUi.machine'

const mocks = vi.hoisted(() => ({
  getQueryClient: vi.fn(),
  invalidateQueries: vi.fn(),
  pollTransactionStatusActor: vi.fn(),
  readPaymentTokenAllowanceActor: vi.fn(),
  submitApprovalActor: vi.fn(),
  submitRenewActor: vi.fn(),
  submitHcaRenewal: vi.fn(),
  getExpiry: vi.fn(),
}))

vi.mock('@/features/profile/service/profileExpiry', () => ({
  getExpiry: mocks.getExpiry,
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

vi.mock('@/features/renew/service/hcaRenewal', () => ({
  submitHcaRenewal: mocks.submitHcaRenewal,
}))

vi.mock('@/utils/router/root-context', () => ({
  getQueryClient: mocks.getQueryClient,
}))

const OWNER = '0x1111111111111111111111111111111111111111'
const CURRENT_EXPIRY = 1_800_000_000n

/** What the chain reports for the name's expiry when a retry re-reads it. */
const expiryOnChain = (expiry: bigint) =>
  okAsync({ expiry, isNonExpiring: false, protocol: 'v2' })

/** What the payment screen hands the renewal: the debit it showed, or the L2 it pays from. */
type Shown = {
  readonly displayedDebit?: HcaDisplayedDebit
  readonly l2Funding?: HcaRenewalL2Funding
}

const startRenewal = (
  protocol: 'v1' | 'v2' = 'v1',
  route: 'eoa' | 'smart-account' = 'eoa',
  shown: Shown = {},
) => {
  const actor = createActor(renewalUiMachine, {
    input: { currentExpiry: CURRENT_EXPIRY, protocol },
  }).start()

  actor.send({ type: 'pricing.step.next' })
  actor.send({ type: 'pricing.token.select', token: 'USDC' })
  actor.send(renewalStartEvent(route, shown))

  return actor
}

const renewalStartEvent = (route: 'eoa' | 'smart-account', shown: Shown) =>
  ({
    type: 'renewal.start',
    label: 'alice',
    duration: 31_536_000n,
    token: 'USDC',
    priceRaw: 10n,
    priceNumber: 10,
    signer: { type: route === 'eoa' ? 'eoa' : 'rhinestone' } as never,
    ownerAddress: OWNER,
    walletClient: {} as never,
    ...shown,
  }) as const

const waitForState = (
  actor: ReturnType<typeof startRenewal>,
  state: 'failure' | 'success',
) => waitFor(actor, (snapshot) => snapshot.matches(state), { timeout: 1_000 })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getQueryClient.mockReturnValue({
    invalidateQueries: mocks.invalidateQueries,
  })
  mocks.readPaymentTokenAllowanceActor.mockReturnValue(okAsync(10n))
  mocks.submitApprovalActor.mockReturnValue(okAsync('approval-tx'))
  mocks.submitRenewActor.mockReturnValue(okAsync('renewal-tx'))
  mocks.pollTransactionStatusActor.mockReturnValue(okAsync(undefined))
  mocks.submitHcaRenewal.mockResolvedValue({
    txId: 'intent-tx',
    quotedFeeUsdc: 1_000_000n,
  })
  mocks.getExpiry.mockReturnValue(expiryOnChain(CURRENT_EXPIRY))
})

describe('V1 renewal state machine', () => {
  it('stores renewal durations as bigint', () => {
    const actor = createActor(renewalUiMachine, {
      input: { currentExpiry: 1_800_000_000n, protocol: 'v1' },
    }).start()

    expect(typeof actor.getSnapshot().context.duration).toBe('bigint')

    actor.send({ type: 'pricing.duration.set', duration: 60n })
    expect(actor.getSnapshot().context.duration).toBe(60n)
    actor.stop()
  })

  it('skips approval when allowance already covers the price', async () => {
    const actor = startRenewal()
    await waitForState(actor, 'success')

    expect(mocks.submitApprovalActor).not.toHaveBeenCalled()
    expect(mocks.submitRenewActor).toHaveBeenCalledOnce()
    actor.stop()
  })

  it('approves before renewing when allowance is insufficient', async () => {
    mocks.readPaymentTokenAllowanceActor.mockReturnValue(okAsync(0n))
    const actor = startRenewal()
    await waitForState(actor, 'success')

    expect(mocks.submitApprovalActor).toHaveBeenCalledOnce()
    expect(mocks.submitRenewActor).toHaveBeenCalledOnce()
    actor.stop()
  })

  it('surfaces a rejected approval', async () => {
    mocks.readPaymentTokenAllowanceActor.mockReturnValue(okAsync(0n))
    mocks.submitApprovalActor.mockReturnValue(
      errAsync(new Error('User rejected the request')),
    )
    const actor = startRenewal()
    const snapshot = await waitForState(actor, 'failure')

    expect(snapshot.context.lastErrorMessage).toBe('User rejected the request')
    actor.stop()
  })

  it('surfaces a failed renewal submission', async () => {
    mocks.submitRenewActor.mockReturnValue(
      errAsync(new Error('Renewal transaction failed')),
    )
    const actor = startRenewal()
    const snapshot = await waitForState(actor, 'failure')

    expect(snapshot.context.lastErrorMessage).toBe('Renewal transaction failed')
    actor.stop()
  })

  it('retries a failed renewal from a fresh allowance check', async () => {
    mocks.submitRenewActor
      .mockReturnValueOnce(errAsync(new Error('Temporary failure')))
      .mockReturnValueOnce(okAsync('renewal-tx'))
    const actor = startRenewal()
    await waitForState(actor, 'failure')

    actor.send({ type: 'retry' })
    await waitForState(actor, 'success')

    expect(mocks.readPaymentTokenAllowanceActor).toHaveBeenCalledTimes(2)
    expect(mocks.submitRenewActor).toHaveBeenCalledTimes(2)
    actor.stop()
  })

  it('does not renew again on retry when the failed attempt actually landed', async () => {
    // The renew transaction was mined, but polling for it failed.
    mocks.pollTransactionStatusActor.mockReturnValueOnce(
      errAsync(new Error('Polling timed out')),
    )
    const actor = startRenewal()
    await waitForState(actor, 'failure')

    mocks.getExpiry.mockReturnValue(expiryOnChain(CURRENT_EXPIRY + 31_536_000n))
    actor.send({ type: 'retry' })
    await waitForState(actor, 'success')

    expect(mocks.getExpiry).toHaveBeenCalledWith('alice.eth', 'v1')
    expect(mocks.submitRenewActor).toHaveBeenCalledOnce()
    actor.stop()
  })

  it('passes the V1 renewer to allowance, approval, and renewal actors', async () => {
    mocks.readPaymentTokenAllowanceActor.mockReturnValue(okAsync(0n))
    const actor = startRenewal('v1')
    await waitForState(actor, 'success')

    const allowanceInput =
      mocks.readPaymentTokenAllowanceActor.mock.calls[0]?.[0]
    const approvalInput = mocks.submitApprovalActor.mock.calls[0]?.[0]
    const renewalInput = mocks.submitRenewActor.mock.calls[0]?.[0]

    expect(allowanceInput.registrarAddress).toBeTruthy()
    expect(approvalInput.registrarAddress).toBe(allowanceInput.registrarAddress)
    expect(renewalInput.renewerAddress).toBe(allowanceInput.registrarAddress)
    actor.stop()
  })

  it('invalidates profile, V1 renewability, and dashboard data after success', async () => {
    const actor = startRenewal('v1')
    await waitForState(actor, 'success')

    const invalidatedKeys = mocks.invalidateQueries.mock.calls.map(
      ([options]) => options.queryKey,
    )
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        [{ name: 'alice.eth' }],
        [expect.objectContaining({ $action: 'is-renewable', protocol: 'v1' })],
        [expect.objectContaining({ $action: 'v1_names', $scope: 'migration' })],
      ]),
    )
    actor.stop()
  })
})

describe('smart-account renewal state machine', () => {
  it('renews as an owner-signed intent and never touches the allowance actors', async () => {
    const actor = startRenewal('v2', 'smart-account')
    await waitForState(actor, 'success')

    expect(mocks.submitHcaRenewal).toHaveBeenCalledOnce()
    expect(mocks.submitHcaRenewal.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        items: [{ label: 'alice', duration: 31_536_000n }],
        protocol: 'v2',
        ownerAddress: OWNER,
      }),
    )
    expect(mocks.readPaymentTokenAllowanceActor).not.toHaveBeenCalled()
    expect(mocks.submitApprovalActor).not.toHaveBeenCalled()
    expect(mocks.submitRenewActor).not.toHaveBeenCalled()
    actor.stop()
  })

  it('checks the funding against the debit the payment screen showed', async () => {
    const displayedDebit = { usdc: 8_853_810n, token: 0n }

    const actor = startRenewal('v2', 'smart-account', { displayedDebit })
    await waitForState(actor, 'success')

    expect(mocks.submitHcaRenewal.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ displayedDebit }),
    )
    actor.stop()
  })

  it('surfaces a failed intent and retries it through the intent route', async () => {
    mocks.submitHcaRenewal
      .mockRejectedValueOnce(new Error('The intent could not be filled'))
      .mockResolvedValueOnce({ txId: 'intent-tx', quotedFeeUsdc: 1_000_000n })

    const actor = startRenewal('v2', 'smart-account')
    const failed = await waitForState(actor, 'failure')
    expect(failed.context.lastErrorMessage).toBe(
      'The intent could not be filled',
    )

    actor.send({ type: 'retry' })
    await waitForState(actor, 'success')

    expect(mocks.submitHcaRenewal).toHaveBeenCalledTimes(2)
    expect(mocks.submitRenewActor).not.toHaveBeenCalled()
    actor.stop()
  })

  it('does not pay again on retry when the failed intent actually filled', async () => {
    mocks.submitHcaRenewal.mockRejectedValueOnce(
      new Error('Timed out waiting for the intent'),
    )
    const actor = startRenewal('v2', 'smart-account')
    await waitForState(actor, 'failure')

    mocks.getExpiry.mockReturnValue(expiryOnChain(CURRENT_EXPIRY + 31_536_000n))
    actor.send({ type: 'retry' })
    await waitForState(actor, 'success')

    expect(mocks.submitHcaRenewal).toHaveBeenCalledOnce()
    actor.stop()
  })

  it('stays failed when the retry cannot re-read the expiry', async () => {
    mocks.submitHcaRenewal.mockRejectedValueOnce(
      new Error('Timed out waiting for the intent'),
    )
    const actor = startRenewal('v2', 'smart-account')
    await waitForState(actor, 'failure')

    mocks.getExpiry.mockReturnValue(errAsync(new Error('rpc down')))
    actor.send({ type: 'retry' })
    const snapshot = await waitForState(actor, 'failure')

    expect(snapshot.context.lastErrorMessage).toMatch(/Couldn't confirm/)
    expect(mocks.submitHcaRenewal).toHaveBeenCalledOnce()
    actor.stop()
  })

  it('records the submitted intent before the fill, so the dialog can hand over', async () => {
    mocks.submitHcaRenewal.mockImplementation(async (input) => {
      input.onSubmitted?.('0xsubmitted')
      await new Promise((resolve) => setTimeout(resolve, 50))
      return { txId: '0xsubmitted', quotedFeeUsdc: 1n }
    })

    const actor = startRenewal('v2', 'smart-account')
    const submitted = await waitFor(
      actor,
      (state) => state.context.renewalTxId === '0xsubmitted',
      { timeout: 1_000 },
    )

    expect(submitted.matches('submittingHcaRenewal')).toBe(true)
    await waitFor(actor, (state) => state.matches('success'), {
      timeout: 1_000,
    })
    actor.stop()
  })

  it('returns to the payment step when the funding prompt is declined', async () => {
    // A decline is a cancel: nothing was signed and nothing was spent, so the
    // user goes back to the payment step rather than to a failure screen.
    mocks.submitHcaRenewal.mockRejectedValue(new HcaFundingDeclinedError())

    const actor = startRenewal('v2', 'smart-account')
    const snapshot = await waitFor(
      actor,
      (state) => state.matches({ pricing: 'tokens' }),
      { timeout: 1_000 },
    )

    expect(mocks.submitHcaRenewal).toHaveBeenCalledOnce()
    expect(snapshot.context.lastErrorMessage).toBeUndefined()
    actor.stop()
  })
})

it('cancels the funding continuation when the renewal actor stops', async () => {
  mocks.submitHcaRenewal.mockReturnValue(new Promise(() => undefined))
  const actor = startRenewal('v2', 'smart-account')
  await vi.waitFor(() => expect(mocks.submitHcaRenewal).toHaveBeenCalledOnce())
  const signal = mocks.submitHcaRenewal.mock.calls[0]?.[0].signal
  expect(signal.aborted).toBe(false)
  actor.stop()
  expect(signal.aborted).toBe(true)
})

describe('increased payment on the smart-account route', () => {
  const CONFIRMED = { usdc: 6_690_000n, token: 0n }
  const increased = (permitValue: bigint) => ({
    permitValue,
    requiresPermit: true,
    quotedFeeUsdc: 900_000n,
    hcaBalanceUsdc: 3_000_000n,
    requiredUsdc: 8_800_000n,
  })
  const UPDATED = increased(6_700_000n)

  type SubmitInput = {
    readonly confirmIncreasedPayment: (
      prompt: ReturnType<typeof increased>,
    ) => Promise<boolean>
  }

  /** Stands in for the funding rail: asks about the increase and signs only once it is accepted. */
  const askThenSign =
    (sign: () => Promise<unknown> | unknown = () => undefined) =>
    async (input: SubmitInput) => {
      if (!(await input.confirmIncreasedPayment(UPDATED)))
        throw new HcaFundingDeclinedError()
      await sign()
      return { txId: 'intent-tx', quotedFeeUsdc: 900_000n }
    }

  const waitForReview = (actor: ReturnType<typeof startRenewal>) =>
    waitFor(
      actor,
      (state) => state.matches({ submittingHcaRenewal: 'reviewingPayment' }),
      { timeout: 1_000 },
    )

  it('signs nothing until the user accepts the updated amount, then keeps it on screen', async () => {
    const sign = vi.fn()
    mocks.submitHcaRenewal.mockImplementation(askThenSign(sign))

    const actor = startRenewal('v2', 'smart-account', {
      displayedDebit: CONFIRMED,
    })
    const review = await waitForReview(actor)

    expect(review.context.paymentUpdate?.prompt).toBe(UPDATED)
    expect(sign).not.toHaveBeenCalled()

    actor.send({ type: 'renewal.payment.accept' })
    const accepted = actor.getSnapshot()
    expect(accepted.matches({ submittingHcaRenewal: 'signing' })).toBe(true)
    expect(accepted.context.paymentUpdate).toEqual({
      status: 'accepted',
      prompt: UPDATED,
    })

    await waitForState(actor, 'success')
    expect(sign).toHaveBeenCalledOnce()
    actor.stop()
  })

  it('returns to the payment step on cancel, declining the increase', async () => {
    const sign = vi.fn()
    let answer: Promise<boolean> | undefined
    mocks.submitHcaRenewal.mockImplementation(async (input: SubmitInput) => {
      answer = input.confirmIncreasedPayment(UPDATED)
      if (!(await answer)) throw new HcaFundingDeclinedError()
      sign()
      return { txId: 'intent-tx', quotedFeeUsdc: 900_000n }
    })

    const actor = startRenewal('v2', 'smart-account', {
      displayedDebit: CONFIRMED,
    })
    await waitForReview(actor)
    actor.send({ type: 'cancel' })

    const snapshot = actor.getSnapshot()
    expect(snapshot.matches({ pricing: 'tokens' })).toBe(true)
    expect(snapshot.context.paymentUpdate).toBeUndefined()
    await expect(answer).resolves.toBe(false)
    expect(sign).not.toHaveBeenCalled()
    actor.stop()
  })

  it('fails on a rejected signature after acceptance, and the retry asks again', async () => {
    mocks.submitHcaRenewal
      .mockImplementationOnce(
        askThenSign(() => Promise.reject(new Error('User rejected'))),
      )
      .mockImplementationOnce(askThenSign())

    const actor = startRenewal('v2', 'smart-account', {
      displayedDebit: CONFIRMED,
    })
    await waitForReview(actor)
    actor.send({ type: 'renewal.payment.accept' })
    const failed = await waitForState(actor, 'failure')
    expect(failed.context.lastErrorMessage).toBe('User rejected')
    // The acceptance belonged to the failed attempt and is not carried over.
    expect(failed.context.paymentUpdate).toBeUndefined()

    actor.send({ type: 'retry' })
    await waitForReview(actor)
    expect(mocks.submitHcaRenewal).toHaveBeenCalledTimes(2)

    actor.send({ type: 'renewal.payment.accept' })
    await waitForState(actor, 'success')
    actor.stop()
  })

  it('declines the open question when the renewal actor stops', async () => {
    // Stopping an actor runs no exit actions, so unmounting the page must
    // still answer the question the abandoned submit is waiting on.
    let answer: Promise<boolean> | undefined
    mocks.submitHcaRenewal.mockImplementation((input: SubmitInput) => {
      answer = input.confirmIncreasedPayment(UPDATED)
      return new Promise(() => undefined)
    })

    const actor = startRenewal('v2', 'smart-account', {
      displayedDebit: CONFIRMED,
    })
    await waitForReview(actor)
    actor.stop()

    await expect(answer).resolves.toBe(false)
  })

  it('declines a late question from an abandoned attempt without replacing the newer receipt', async () => {
    const inputs: SubmitInput[] = []
    // Each attempt waits on its quote until the test answers it.
    mocks.submitHcaRenewal.mockImplementation((input: SubmitInput) => {
      inputs.push(input)
      return new Promise(() => undefined)
    })

    const actor = startRenewal('v2', 'smart-account', {
      displayedDebit: CONFIRMED,
    })
    await vi.waitFor(() => expect(inputs).toHaveLength(1))
    actor.send({ type: 'label.changed' })
    actor.send({ type: 'pricing.step.next' })
    actor.send(
      renewalStartEvent('smart-account', { displayedDebit: CONFIRMED }),
    )
    await vi.waitFor(() => expect(inputs).toHaveLength(2))

    // The abandoned attempt's quote lands while the new one is still quoting.
    await expect(
      inputs[0]?.confirmIncreasedPayment(increased(9_000_000n)),
    ).resolves.toBe(false)
    expect(
      actor.getSnapshot().matches({ submittingHcaRenewal: 'signing' }),
    ).toBe(true)

    void inputs[1]?.confirmIncreasedPayment(UPDATED)
    const review = await waitForReview(actor)
    expect(review.context.paymentUpdate?.prompt).toBe(UPDATED)
    actor.stop()
  })
})

describe('renewal paid from an L2', () => {
  const l2ChainId = 84_532
  const l2Funding = {
    source: { chain: { id: l2ChainId } } as never,
    displayedCharge: 2_100_000n,
  }

  it('pays a USDC renewal from the chosen L2 until a wallet coin replaces it', () => {
    const actor = createActor(renewalUiMachine, {
      input: { currentExpiry: CURRENT_EXPIRY, protocol: 'v2' },
    }).start()
    actor.send({ type: 'pricing.step.next' })

    actor.send({ type: 'pricing.fundingSource.select', chainId: l2ChainId })
    expect(actor.getSnapshot().context).toMatchObject({
      fundingSourceChainId: l2ChainId,
      fundingSourceOrigin: 'user',
      selectedToken: 'USDC',
    })

    actor.send({ type: 'pricing.token.select', token: 'USDC' })
    expect(actor.getSnapshot().context.fundingSourceChainId).toBeUndefined()
    actor.stop()
  })

  it.each([
    ["a click is the user's", undefined, 'user'],
    ["a pick by the app is the fallback's", 'fallback', 'fallback'],
  ] as const)(
    'records who picked a wallet coin: %s',
    (_case, origin, expected) => {
      const actor = createActor(renewalUiMachine, {
        input: { currentExpiry: CURRENT_EXPIRY, protocol: 'v2' },
      }).start()
      actor.send({ type: 'pricing.step.next' })

      actor.send({
        type: 'pricing.token.select',
        token: 'USDC',
        ...(origin ? { origin } : {}),
      })
      expect(actor.getSnapshot().context.fundingSourceOrigin).toBe(expected)
      actor.stop()
    },
  )

  it('hands the L2 and the charge shown to the renewal', async () => {
    const actor = startRenewal('v2', 'smart-account', { l2Funding })
    await waitForState(actor, 'success')

    expect(mocks.submitHcaRenewal.mock.calls[0]?.[0].l2Funding).toBe(l2Funding)
    actor.stop()
  })

  it('never starts a wallet-route renewal that names an L2', () => {
    const actor = startRenewal('v2', 'eoa', { l2Funding })

    expect(actor.getSnapshot().matches({ pricing: 'tokens' })).toBe(true)
    expect(mocks.readPaymentTokenAllowanceActor).not.toHaveBeenCalled()
    actor.stop()
  })
})
