import '@testing-library/jest-dom'
import type {
  HcaFundingApprovalPrompt,
  HcaFundingApprovalState,
} from '@ens-apps/transaction-manager'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { HcaFundingApprovalDialog } from './HcaFundingApprovalDialog'

i18n.loadAndActivate({ locale: 'en', messages: {} })
const prompt: HcaFundingApprovalPrompt = {
  kind: 'approval',
  chainId: 1,
  owner: '0x3333333333333333333333333333333333333333',
  token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  spender: '0x1111111111111111111111111111111111111111',
  amount: 4n,
  symbol: 'USDC',
  decimals: 6,
  nativeSymbol: 'ETH',
  maxGasCost: 150000n,
}

it.each(['approval', 'approval-wallet', 'approval-receipt'] as const)(
  'moves focus into a newly opened %s modal and restores the invoker when it closes',
  async (kind) => {
    const onDecline = vi.fn()
    const state: HcaFundingApprovalState =
      kind === 'approval-receipt'
        ? {
            kind,
            prompt,
            hash: '0x1111111111111111111111111111111111111111111111111111111111111111',
          }
        : { kind, prompt }
    const content = (current: HcaFundingApprovalState) => (
      <I18nProvider i18n={i18n}>
        <button type="button">Invoker</button>
        <HcaFundingApprovalDialog
          onApprove={() => undefined}
          onDecline={onDecline}
          state={current}
        />
      </I18nProvider>
    )
    const view = render(content({ kind: 'idle' }))
    const invoker = screen.getByRole('button', { name: 'Invoker' })
    invoker.focus()
    view.rerender(content(state))
    const dialog = await screen.findByRole('alertdialog')
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    )
    invoker.focus()
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    )
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onDecline).toHaveBeenCalledTimes(kind === 'approval' ? 1 : 0)
    view.rerender(content({ kind: 'idle' }))
    await waitFor(() => expect(invoker).toHaveFocus())
  },
)

it('keeps a focus target when consent actions become disabled during wallet pending', async () => {
  const content = (state: HcaFundingApprovalState) => (
    <I18nProvider i18n={i18n}>
      <HcaFundingApprovalDialog
        onApprove={() => undefined}
        onDecline={() => undefined}
        state={state}
      />
    </I18nProvider>
  )
  const view = render(content({ kind: 'approval', prompt }))
  const dialog = await screen.findByRole('alertdialog')
  const action = screen.getByRole('button', { name: 'Approve USDC' })
  action.focus()
  view.rerender(content({ kind: 'approval-wallet', prompt }))
  await waitFor(() => expect(dialog).toHaveFocus())
  expect(screen.getByRole('button', { name: 'Approving' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
})
