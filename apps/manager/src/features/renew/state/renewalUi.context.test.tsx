import '@testing-library/jest-dom'
import type { HcaFundingPrompt } from '@ens-apps/transaction-manager'
import { HcaFundingDeclinedError } from '@ens-apps/transaction-manager/helpers/hca-intent-funding'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useSelector } from '@xstate/react'
import { okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ submit: vi.fn() }))
vi.mock('@/features/renew/service/hcaRenewal', () => ({
  submitHcaRenewal: mocks.submit,
}))
vi.mock('@/features/profile/service/profileExpiry', () => ({
  getExpiry: () =>
    okAsync({ expiry: 1800000000n, isNonExpiring: false, protocol: 'v2' }),
}))
vi.mock('@/utils/router/root-context', () => ({ getQueryClient: () => null }))
vi.mock('../components/RenewalFundingDialog', () => ({
  RenewalFundingDialog: () => null,
}))

import {
  type RenewalUiActor,
  RenewalUiProvider,
  useRenewalUiContext,
} from './renewalUi.context'

let actor: RenewalUiActor
const Consumer = () => {
  const context = useRenewalUiContext()
  actor = context.uiActor
  const state = useSelector(context.uiActor, (state) => state.value)
  return (
    <>
      <span>
        {context.fundingPrompt?.permitValue.toString() ?? 'No updated quote'}
      </span>
      <span>
        {context.isFundingDecisionPending
          ? 'Decision pending'
          : 'No decision pending'}
      </span>
      <span>{JSON.stringify(state)}</span>
      <button onClick={context.approveFunding} type="button">
        Accept
      </button>
      <button onClick={context.declineFunding} type="button">
        Decline
      </button>
    </>
  )
}
const prompt: HcaFundingPrompt = {
  permitValue: 6700000n,
  requiresPermit: true,
  requiredUsdc: 9680000n,
  quotedFeeUsdc: 20000n,
  hcaBalanceUsdc: 3000000n,
}
const start = () =>
  act(() => {
    actor.send({ type: 'pricing.step.next' })
    actor.send({ type: 'pricing.token.select', token: 'USDC' })
    actor.send({
      type: 'renewal.start',
      label: 'abc',
      duration: 31536000n,
      token: 'USDC',
      priceRaw: 8800000n,
      priceNumber: 8.8,
      displayedWalletDebitUsdc: 6690000n,
      signer: { type: 'rhinestone' } as never,
      ownerAddress: '0x0000000000000000000000000000000000000001',
      walletClient: {} as never,
    })
  })
const show = () =>
  render(
    <RenewalUiProvider currentExpiry={1800000000n} label="abc" protocol="v2">
      <Consumer />
    </RenewalUiProvider>,
  )
beforeEach(() => vi.clearAllMocks())

describe('renewal payment lifecycle', () => {
  it('clears an accepted receipt when a failed signing attempt is retried and the new quote is declined', async () => {
    mocks.submit.mockImplementation(async (input) => {
      if (!(await input.confirmFunding(prompt)))
        throw new HcaFundingDeclinedError()
      input.onSigningRequested()
      throw new Error('Wallet signature rejected')
    })
    show()
    start()
    await screen.findByText('Decision pending')
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await screen.findByText('"failure"')
    act(() => actor.send({ type: 'retry' }))
    await screen.findByText('Decision pending')
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    await screen.findByText('{"pricing":"tokens"}')
    expect(screen.getByText('No updated quote')).toBeVisible()
    expect(screen.getByText('No decision pending')).toBeVisible()
    expect(mocks.submit).toHaveBeenCalledTimes(2)
  })

  it('keeps the accepted receipt while signing, then clears it on cancellation', async () => {
    mocks.submit.mockImplementation(async (input) => {
      if (!(await input.confirmFunding(prompt)))
        throw new HcaFundingDeclinedError()
      input.onSigningRequested()
      await new Promise(() => {})
    })
    show()
    start()
    await screen.findByText('Decision pending')
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await waitFor(() =>
      expect(screen.getByText('No decision pending')).toBeVisible(),
    )
    expect(screen.getByText('6700000')).toBeVisible()
    act(() => actor.send({ type: 'label.changed' }))
    expect(screen.getByText('No updated quote')).toBeVisible()
  })
  it('resolves a pending decision as declined when the name changes', async () => {
    const decision = vi.fn()
    mocks.submit.mockImplementation(async (input) => {
      decision(await input.confirmFunding(prompt))
      throw new HcaFundingDeclinedError()
    })
    show()
    start()
    await screen.findByText('Decision pending')
    act(() => actor.send({ type: 'label.changed' }))
    await waitFor(() => expect(decision).toHaveBeenCalledWith(false))
    expect(screen.getByText('No updated quote')).toBeVisible()
  })

  it('rejects a late quote from an abandoned attempt while the next attempt is active', async () => {
    let abandonedConfirm:
      | ((prompt: HcaFundingPrompt) => Promise<boolean> | boolean)
      | undefined
    mocks.submit
      .mockImplementationOnce((input) => {
        abandonedConfirm = input.confirmFunding
        return new Promise(() => {})
      })
      .mockImplementationOnce(async (input) => {
        if (!(await input.confirmFunding(prompt)))
          throw new HcaFundingDeclinedError()
        return { txId: 'renewed', quotedFeeUsdc: 20000n }
      })
    show()
    start()
    await waitFor(() => expect(abandonedConfirm).toBeDefined())
    act(() => actor.send({ type: 'label.changed' }))
    start()
    await screen.findByText('Decision pending')
    await expect(Promise.resolve(abandonedConfirm?.(prompt))).resolves.toBe(
      false,
    )
    expect(screen.getByText('Decision pending')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    await screen.findByText('{"pricing":"tokens"}')
    expect(screen.getByText('No updated quote')).toBeVisible()
  })
})
