import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PaymentMethodList } from './PaymentMethodList'

i18n.loadAndActivate({ locale: 'en', messages: {} })

const methods = [
  { id: 'ens', symbol: 'ENS', name: 'Ethereum Name Service' },
  { id: 'usdt', symbol: 'USDT', name: 'Tether USD' },
  { id: 'weth', symbol: 'WETH', name: 'Wrapped Ether' },
  { id: 'dai', symbol: 'DAI', name: 'Dai' },
  { id: 'usdc', symbol: 'USDC', name: 'USD Coin' },
] as const

const renderList = () =>
  render(
    <I18nProvider i18n={i18n}>
      <PaymentMethodList
        items={methods.map(({ id, symbol, name }) => ({
          id,
          isSelected: false,
          tokenSymbol: symbol,
          searchText: `${symbol} ${name}`,
          content: <span>{symbol}</span>,
        }))}
      />
    </I18nProvider>,
  )

describe('PaymentMethodList', () => {
  it('shows held suggested tokens in the preferred order, then the rest', () => {
    renderList()

    expect(
      screen.getAllByRole('listitem').map(({ textContent }) => textContent),
    ).toEqual(['USDC', 'DAI', 'WETH', 'ENS', 'USDT'])
    expect(screen.getByRole('heading', { name: 'Suggested' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Your tokens' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Load more' }),
    ).not.toBeInTheDocument()
  })

  it('filters by token name and clears without resizing the list', () => {
    const { container } = renderList()
    const list = container.firstElementChild

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search tokens' }), {
      target: { value: 'tether' },
    })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('USDT')).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Search results' }),
    ).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(methods.length)
    expect(container.firstElementChild).toBe(list)
  })
})
