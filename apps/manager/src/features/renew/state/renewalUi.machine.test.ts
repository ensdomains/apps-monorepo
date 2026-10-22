import { HcaFundingDeclinedError } from '@ens-apps/transaction-manager/helpers/hca-intent-funding'
import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createActor, waitFor } from 'xstate'
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

const startRenewal = (
  protocol: 'v1' | 'v2' = 'v1',
  route: 'eoa' | 'smart-account' = 'eoa',
) => {
  const actor = createActor(renewalUiMachine, {
    input: { currentExpiry: CURRENT_EXPIRY, protocol },
  }).start()

  actor.send({ type: 'pricing.step.next' })
  actor.send({ type: 'pricing.token.select', token: 'USDC' })
  actor.send({
    type: 'renewal.start',
    label: 'alice',
    duration: 31_536_000n,
    token: 'USDC',
    priceRaw: 10n,
    priceNumber: 10,
    signer: { type: route === 'eoa' ? 'eoa' : 'rhinestone' } as never,
    ownerAddress: OWNER,
    walletClient: {} as never,
  })

  return actor
}

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
