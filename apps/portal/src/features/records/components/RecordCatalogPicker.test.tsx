import {
  type AddressRecordOption,
  searchAddressRecords,
} from '@ens-apps/record-catalog'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AddressRecordPicker } from './RecordCatalogPicker'

const Form = () => {
  const [coin, setCoin] = useState<AddressRecordOption>()
  const valueRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <AddressRecordPicker
        search={searchAddressRecords}
        onSelect={setCoin}
        focusAfterSelectRef={valueRef}
        trigger={<button type="button">{coin?.coinType ?? 'Coin'}</button>}
      />
      <input ref={valueRef} aria-label="Value" defaultValue="0xdraft" />
    </>
  )
}

describe('AddressRecordPicker', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fills the exact coin type picked by chain ID and moves on to the value', async () => {
    const user = userEvent.setup()
    render(<Form />)

    await user.click(screen.getByRole('button', { name: 'Coin' }))
    await user.type(
      screen.getByRole('combobox', { name: 'Search coins and chains' }),
      '84532',
    )
    await user.keyboard('{Enter}')

    expect(
      screen.getByRole('button', { name: '2147568180' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Value' })).toHaveFocus()
    expect(screen.getByRole('textbox', { name: 'Value' })).toHaveValue(
      '0xdraft',
    )
  })

  it('explains an empty search and closes on Escape without picking', async () => {
    const user = userEvent.setup()
    render(<Form />)

    await user.click(screen.getByRole('button', { name: 'Coin' }))
    await user.type(screen.getByRole('combobox'), 'nope')
    expect(
      screen.getByText('No coin or chain matches “nope”.'),
    ).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Coin' })).toHaveFocus()
  })

  it('opens the full list on a touch phone without raising the keyboard', async () => {
    vi.stubGlobal('innerWidth', 390)
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }))
    const user = userEvent.setup()
    render(<Form />)

    await user.click(screen.getByRole('button', { name: 'Coin' }))

    expect(
      screen.getByRole('dialog', { name: 'Coins and chains' }),
    ).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Coin' })).toHaveFocus()
  })
})
