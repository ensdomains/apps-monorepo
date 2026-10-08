import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PaymentBreakdownRow } from './PaymentBreakdownRow'

i18n.loadAndActivate({ locale: 'en', messages: {} })

type RowProps = Parameters<typeof PaymentBreakdownRow>[0]

const renderRow = (props: RowProps) =>
  render(
    <I18nProvider i18n={i18n}>
      <PaymentBreakdownRow {...props} />
    </I18nProvider>,
  )

describe('PaymentBreakdownRow', () => {
  it('marks a credit as a deduction', () => {
    renderRow({
      amount: 1.82,
      isCredit: true,
      isLoading: false,
      label: 'Credit',
    })

    expect(screen.getByText('-$1.82')).toBeVisible()
  })

  it('holds the line while a figure is still being quoted', () => {
    renderRow({ amount: undefined, isLoading: false, label: 'Network fee' })

    expect(screen.getByText('—')).toBeVisible()
  })

  it('requires a label for the tooltip trigger', () => {
    renderRow({
      amount: 4.32,
      isLoading: false,
      label: 'Network fee',
      tooltip: 'Why this costs what it does',
      tooltipLabel: 'What is the network fee?',
    })

    expect(
      screen.getByRole('button', { name: 'What is the network fee?' }),
    ).toBeVisible()

    // A tooltip with no accessible name must not typecheck.
    const invalid = (
      // @ts-expect-error tooltipLabel is required alongside tooltip
      <PaymentBreakdownRow amount={1} isLoading={false} label="x" tooltip="y" />
    )
    expect(invalid).toBeTruthy()
  })
})
