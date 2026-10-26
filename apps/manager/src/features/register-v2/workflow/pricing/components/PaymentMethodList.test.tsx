import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PaymentMethodList } from './PaymentMethodList'

i18n.loadAndActivate({ locale: 'en', messages: {} })

const ids = ['Sepolia', 'Arbitrum', 'OP', 'Base']

describe('PaymentMethodList', () => {
  it('shows three, then expands and collapses in order', () => {
    render(
      <I18nProvider i18n={i18n}>
        <PaymentMethodList
          items={ids.map((id) => ({
            id,
            isSelected: false,
            content: <span>{id}</span>,
          }))}
        />
      </I18nProvider>,
    )

    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 more' }))
    expect(
      screen.getAllByRole('listitem').map(({ textContent }) => textContent),
    ).toEqual(ids)
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })
})
