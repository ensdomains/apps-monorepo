import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { cleanup, render, screen } from '@testing-library/react'
import { createElement, createRef, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MigrationWalletRequestDescriptor } from '../service/buildStepDescriptors'
import { GameStepView } from './GameStep'

vi.mock('@/features/migration/state/migrationUi.context', () => ({
  useMigrationUiContext: vi.fn(),
}))
vi.mock('@/features/migration/state/migrationUi.selectors', () => ({
  useMigrateSubstep: vi.fn(),
  useMigrationProgress: vi.fn(),
  useMigrationSelectedNames: vi.fn(),
  useMigrationStepDescriptors: vi.fn(),
}))
vi.mock('@/features/migration/hooks/useElementWidth', () => ({
  useElementWidth: () => ({ ref: createRef<HTMLDivElement>(), width: 119 }),
}))

i18n.loadAndActivate({ locale: 'en', messages: {} })
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(I18nProvider, { i18n }, children)
const scene = (currentStep: number, totalSteps: number) =>
  createElement(GameStepView, {
    hasCollapsed: false,
    progress: {
      currentStep,
      totalSteps,
      description: 'Confirm in your wallet',
    },
    selectedNameCount: 12,
    stepDescriptors: [],
  })

describe('migration transaction progress', () => {
  afterEach(cleanup)
  it('keeps the progress bar present from the first transaction through completion', () => {
    const { rerender } = render(scene(0, 6), { wrapper })
    const progress = screen.getByRole('progressbar', {
      name: 'Upgrade progress',
    })
    expect(progress.getAttribute('aria-valuenow')).toBe('0')
    expect(progress.getAttribute('aria-valuemax')).toBe('6')
    expect(screen.getByText('Step 1 of 6')).toBeDefined()
    rerender(scene(3, 6))
    expect(screen.getByRole('progressbar')).toBe(progress)
    expect(progress.getAttribute('aria-valuenow')).toBe('3')
    expect(screen.getByText('Step 4 of 6')).toBeDefined()
    rerender(scene(6, 6))
    expect(progress.getAttribute('aria-valuenow')).toBe('6')
    expect(screen.getByText('Step 6 of 6')).toBeDefined()
  })
  it('also shows progress for one transaction', () => {
    render(scene(0, 1), { wrapper })
    expect(screen.getByRole('progressbar').getAttribute('aria-valuemax')).toBe(
      '1',
    )
    expect(screen.getByText('Step 1 of 1')).toBeDefined()
  })

  it('shows approval and renewal as separate numbered steps before the upgrade', () => {
    const stepDescriptors: readonly MigrationWalletRequestDescriptor[] = [
      { type: 'renewal-approval' },
      { type: 'renew-grace', count: 9 },
      {
        type: 'atomic-batch',
        index: 0,
        total: 1,
        count: 22,
        migrateCount: 22,
        copyCount: 0,
        roleGrants: [],
      },
    ]
    const renewalScene = (
      currentStep: number,
      isAwaitingConfirmation: boolean,
    ) =>
      createElement(GameStepView, {
        hasCollapsed: false,
        selectedNameCount: 22,
        stepDescriptors,
        progress: {
          currentStep,
          totalSteps: 3,
          description: '',
          isAwaitingConfirmation,
        },
      })
    const { rerender } = render(renewalScene(0, false), { wrapper })
    expect(screen.getByText('Step 1 of 3')).toBeDefined()
    expect(
      screen.getByText('Approve renewal payment in your wallet'),
    ).toBeDefined()
    expect(screen.queryByText('Renewing 9 names...')).toBeNull()

    rerender(renewalScene(0, true))
    expect(screen.getByText('Step 1 of 3')).toBeDefined()
    expect(
      screen.getByText('Confirming renewal payment approval...'),
    ).toBeDefined()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(
      '0',
    )

    rerender(renewalScene(1, true))
    expect(screen.getByText('Step 2 of 3')).toBeDefined()
    expect(screen.getByText('Renewing 9 names...')).toBeDefined()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(
      '1',
    )

    rerender(renewalScene(2, false))
    expect(screen.getByText('Step 3 of 3')).toBeDefined()
    expect(screen.getByText('Upgrading 22 names...')).toBeDefined()
  })
})
