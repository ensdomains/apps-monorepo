import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  PaymentMethodList,
  type PaymentMethodListItem,
} from './PaymentMethodList'

i18n.loadAndActivate({ locale: 'en', messages: {} })

const item = (
  id: string,
  status: Partial<Omit<PaymentMethodListItem, 'id' | 'content'>> = {},
): PaymentMethodListItem => ({
  id,
  isAvailable: true,
  isFunded: true,
  isCommon: false,
  content: <span>{id}</span>,
  ...status,
})

const renderList = (items: readonly PaymentMethodListItem[]) =>
  render(
    <I18nProvider i18n={i18n}>
      <PaymentMethodList items={items} />
    </I18nProvider>,
  )

describe('PaymentMethodList', () => {
  it('shows valid methods and an exact hidden count, then expands in order', () => {
    const items = [
      item('USDC'),
      item('DAI'),
      item('USDT', { isFunded: false }),
      item('ETH', { isAvailable: false }),
      item('OP USDC', { isAvailable: false }),
      item('OP DAI', { isAvailable: false }),
      item('OP USDT', { isAvailable: false }),
      item('OP ETH', { isAvailable: false }),
      item('Base USDC', { isAvailable: false }),
    ]
    renderList(items)

    expect(screen.getByText('USDC')).toBeVisible()
    expect(screen.getByText('DAI')).toBeVisible()
    expect(screen.queryByText('USDT')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Load 7 more' }))

    expect(screen.getAllByRole('listitem')).toHaveLength(9)
    expect(
      screen.getAllByRole('listitem').map((listItem) => listItem.textContent),
    ).toEqual(items.map(({ id }) => id))
    expect(
      screen.queryByRole('button', { name: /Load .* more/ }),
    ).not.toBeInTheDocument()
  })

  it('uses the standard keyboard-visible ring on the load-more control', () => {
    renderList([item('USDC'), item('DAI'), item('USDT', { isFunded: false })])

    expect(screen.getByRole('button', { name: 'Load 1 more' })).toHaveClass(
      'outline-none',
      'focus-visible:ring-2',
      'focus-visible:ring-ens-blue',
      'focus-visible:ring-offset-2',
    )
  })

  it('shows only common supplied errors when no method is valid', () => {
    renderList([
      item('USDC error', {
        isAvailable: false,
        isFunded: false,
        isCommon: true,
      }),
      item('DAI error', {
        isAvailable: false,
        isFunded: false,
        isCommon: true,
      }),
      item('uncommon error', {
        isAvailable: false,
        isFunded: false,
      }),
    ])

    expect(screen.getByText('USDC error')).toBeVisible()
    expect(screen.getByText('DAI error')).toBeVisible()
    expect(screen.queryByText('uncommon error')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load 1 more' })).toBeVisible()
  })

  it('renders an empty list without a load control', () => {
    renderList([])

    expect(
      screen.getByRole('list', { name: 'Payment methods' }),
    ).toBeEmptyDOMElement()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
