import '@testing-library/jest-dom'
import type {
  HcaFundingApprovalPrompt,
  HcaFundingApprovalRecoveryPrompt,
  HcaFundingApprovalState,
} from '@ens-apps/transaction-manager'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useHcaFundingPrompt } from '@/lib/smart-account/useHcaFundingPrompt'
import { keepClosingDialogsMounted } from '@/test-utils/exitAnimation'
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

afterEach(() => {
  vi.restoreAllMocks()
})

const recoveryPrompt: HcaFundingApprovalRecoveryPrompt = {
  ...prompt,
  kind: 'approval-recovery',
  reservedAmount: 7_000_000n,
}

it.each(['Cancel', 'Clear and retry'] as const)(
  'resolves recovery through %s while requiring separate consent for a new approval',
  async (action) => {
    const recoveryDecided = vi.fn()
    const approvalDecided = vi.fn()
    const Recovery = () => {
      const consent = useHcaFundingPrompt()
      return (
        <>
          <button
            onClick={async () => {
              const hasCleared =
                await consent.confirmApprovalRecovery(recoveryPrompt)
              recoveryDecided(hasCleared)
              if (hasCleared)
                approvalDecided(await consent.confirmApproval(prompt))
            }}
            type="button"
          >
            Retry renewal
          </button>
          <HcaFundingApprovalDialog
            onApprove={consent.approve}
            onDecline={consent.decline}
            state={consent.approvalState}
          />
        </>
      )
    }
    render(
      <I18nProvider i18n={i18n}>
        <Recovery />
      </I18nProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry renewal' }))
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Resolve your earlier USDC approval',
    })
    expect(dialog).toHaveAccessibleDescription(
      /Reject any waiting USDC approval request in your wallet\. If a transaction was already sent, wait for that transaction or its cancellation to confirm before clearing\. Clearing the app record does not cancel a wallet transaction\./,
    )
    expect(screen.getByText('7 USDC')).toBeInTheDocument()
    expect(screen.queryByText('Maximum network fee')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus(),
    )
    const clear = screen.getByRole('button', { name: 'Clear and retry' })
    expect(clear).toBeDisabled()
    fireEvent.click(clear)
    expect(recoveryDecided).not.toHaveBeenCalled()
    if (action === 'Clear and retry') {
      fireEvent.click(
        screen.getByRole('checkbox', {
          name: 'The earlier USDC approval is no longer pending.',
        }),
      )
      expect(clear).toBeEnabled()
    }
    fireEvent.click(screen.getByRole('button', { name: action }))
    await waitFor(() =>
      expect(recoveryDecided).toHaveBeenCalledWith(
        action === 'Clear and retry',
      ),
    )
    expect(approvalDecided).not.toHaveBeenCalled()
    if (action === 'Cancel') {
      await waitFor(() =>
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
      )
      return
    }
    await screen.findByRole('alertdialog', {
      name: 'Approve USDC for your renewal?',
    })
    expect(screen.getByText('Maximum network fee')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve USDC' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Approve USDC' }))
    await waitFor(() => expect(approvalDecided).toHaveBeenCalledWith(true))
  },
)

it('requires a new wallet confirmation when a recovery prompt changes or reopens', async () => {
  const state: HcaFundingApprovalState = {
    kind: 'approval-recovery',
    prompt: recoveryPrompt,
  }
  const content = (current: HcaFundingApprovalState) => (
    <I18nProvider i18n={i18n}>
      <HcaFundingApprovalDialog
        onApprove={() => undefined}
        onDecline={() => undefined}
        state={current}
      />
    </I18nProvider>
  )
  const view = render(content(state))
  fireEvent.click(await screen.findByRole('checkbox'))
  expect(screen.getByRole('button', { name: 'Clear and retry' })).toBeEnabled()
  view.rerender(
    content({
      kind: 'approval-recovery',
      prompt: { ...recoveryPrompt, reservedAmount: 8_000_000n },
    }),
  )
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  expect(screen.getByRole('button', { name: 'Clear and retry' })).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'))
  view.rerender(content({ kind: 'idle' }))
  view.rerender(content(state))
  expect(await screen.findByRole('checkbox')).not.toBeChecked()
  expect(screen.getByRole('button', { name: 'Clear and retry' })).toBeDisabled()
})

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

it('keeps the allowance on screen while it closes after the approval lands', () => {
  keepClosingDialogsMounted()
  const content = (state: HcaFundingApprovalState) => (
    <I18nProvider i18n={i18n}>
      <HcaFundingApprovalDialog
        onApprove={() => undefined}
        onDecline={() => undefined}
        state={state}
      />
    </I18nProvider>
  )
  // Mounted idle, as every caller mounts it.
  const view = render(content({ kind: 'idle' }))
  view.rerender(
    content({
      kind: 'approval-receipt',
      prompt,
      hash: '0x1111111111111111111111111111111111111111111111111111111111111111',
    }),
  )

  view.rerender(content({ kind: 'idle' }))

  expect(screen.getByText('0.000004 USDC')).toBeInTheDocument()
  expect(screen.getByText(/Waiting for the USDC approval/)).toBeInTheDocument()

  fireEvent.animationEnd(screen.getByRole('alertdialog'))
  expect(screen.queryByText('0.000004 USDC')).not.toBeInTheDocument()
})

it('takes no second answer while it closes after consent', () => {
  keepClosingDialogsMounted()
  const onApprove = vi.fn()
  const content = (state: HcaFundingApprovalState) => (
    <I18nProvider i18n={i18n}>
      <HcaFundingApprovalDialog
        onApprove={onApprove}
        onDecline={() => undefined}
        state={state}
      />
    </I18nProvider>
  )
  const view = render(content({ kind: 'approval', prompt }))

  view.rerender(content({ kind: 'idle' }))
  fireEvent.click(screen.getByRole('button', { name: 'Approve USDC' }))

  expect(onApprove).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
})
