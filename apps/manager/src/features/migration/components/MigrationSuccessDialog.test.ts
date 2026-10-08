import { setupI18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { type ComponentProps, createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MigrationSuccessDialog } from './MigrationSuccessDialog'

// Test the dialog's actual action routing independently of portal/focus mechanics.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? createElement('div', { role: 'dialog' }, children) : null,
  DialogContent: ({ children }: { children: ReactNode }) =>
    createElement('div', {}, children),
  DialogTitle: ({ children }: { children: ReactNode }) =>
    createElement('h2', {}, children),
  DialogDescription: ({ children }: { children: ReactNode }) =>
    createElement('p', {}, children),
}))
vi.mock('@/components/ui/material-symbol', () => ({ MSymbol: () => null }))
vi.mock('./success/CommemorativeNftCard', () => ({
  CommemorativeNftCard: () => null,
}))
const i18n = setupI18n({ locale: 'en', messages: { en: {} } })
const showError = (options: {
  stage: 'claim' | 'configuration'
  context?: ComponentProps<typeof MigrationSuccessDialog>['context']
  canRetry?: boolean
}) => {
  const callbacks = {
    onClose: vi.fn(),
    onRetry: vi.fn(),
    onOpenDashboard: vi.fn(),
    onMint: vi.fn(),
  }
  render(
    createElement(
      I18nProvider,
      { i18n },
      createElement(MigrationSuccessDialog, {
        ...callbacks,
        context: options.context ?? 'mint-later',
        open: true,
        migratedNameCount: 1,
        canMint: false,
        canRetry: options.canRetry ?? true,
        state: {
          status: 'error',
          stage: options.stage,
          message: 'Claim recovery could not be loaded.',
        },
      }),
    ),
  )
  return callbacks
}
afterEach(cleanup)

describe('MigrationSuccessDialog error actions', () => {
  it('offers Retry and Close for a claim error without artwork', () => {
    const callbacks = showError({ stage: 'claim' })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(callbacks.onRetry).toHaveBeenCalledTimes(1)
    expect(callbacks.onClose).not.toHaveBeenCalled()
    expect(callbacks.onOpenDashboard).not.toHaveBeenCalled()
    const errorContent = screen.getByText(
      'Claim recovery could not be loaded.',
    ).parentElement
    if (!errorContent) throw new Error('Missing error content')
    fireEvent.click(within(errorContent).getByRole('button', { name: 'Close' }))
    expect(callbacks.onClose).toHaveBeenCalledTimes(1)
    expect(callbacks.onMint).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('button', { name: 'Continue to profile' }),
    ).toBeNull()
  })
  it('offers Close when retry is unavailable', () => {
    const callbacks = showError({ stage: 'claim', canRetry: false })
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    const errorContent = screen.getByText(
      'Claim recovery could not be loaded.',
    ).parentElement
    if (!errorContent) throw new Error('Missing error content')
    fireEvent.click(within(errorContent).getByRole('button', { name: 'Close' }))
    expect(callbacks.onClose).toHaveBeenCalledTimes(1)
    expect(callbacks.onRetry).not.toHaveBeenCalled()
  })
  it.each([
    'mint-later',
    'migration',
  ] as const)('routes the configuration fallback to the dashboard in %s', (context) => {
    const callbacks = showError({ stage: 'configuration', context })
    fireEvent.click(screen.getByRole('button', { name: 'Go to dashboard' }))
    expect(callbacks.onOpenDashboard).toHaveBeenCalledTimes(1)
    expect(callbacks.onClose).not.toHaveBeenCalled()
    expect(callbacks.onRetry).not.toHaveBeenCalled()
    expect(callbacks.onMint).not.toHaveBeenCalled()
  })
})
