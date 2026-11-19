import {
  type AddressRecordOption,
  searchAddressRecords,
} from '@ens-apps/record-catalog'
import { getAddressRecordIcon } from '@ens-apps/record-catalog/address-icons'
import { searchTextRecords } from '@ens-apps/record-catalog/text'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AddressRecordPicker, TextRecordPicker } from './RecordCatalogPicker'

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

describe('record artwork', () => {
  const openPicker = async (picker: React.ReactNode, query: string) => {
    const user = userEvent.setup()
    render(picker)
    await user.click(screen.getByRole('button', { name: 'Browse' }))
    await user.type(screen.getByRole('combobox'), query)
  }
  const artworkOf = (option: HTMLElement) =>
    option.querySelector('[data-slot="record-artwork"]')

  it('draws the shared coin logo beside an unchanged option name', async () => {
    await openPicker(
      <AddressRecordPicker
        search={searchAddressRecords}
        onSelect={() => undefined}
        trigger={<button type="button">Browse</button>}
      />,
      'litecoin',
    )

    const option = screen.getByRole('option', {
      name: 'Litecoin Coin type 2 EVM chain ID none',
    })
    const logo = await within(option).findByRole('presentation', {
      hidden: true,
    })
    expect(logo.getAttribute('src')).toBe(getAddressRecordIcon(2))
    expect(artworkOf(option)).toHaveAttribute('aria-hidden', 'true')
  })

  it('keeps the same frame with a monogram when a coin has no logo', async () => {
    await openPicker(
      <AddressRecordPicker
        search={searchAddressRecords}
        onSelect={() => undefined}
        trigger={<button type="button">Browse</button>}
      />,
      '2147483648',
    )

    const option = screen.getByRole('option', {
      name: 'Any EVM chain Coin type 2147483648 EVM chain ID none',
    })
    expect(getAddressRecordIcon(2147483648)).toBeUndefined()
    expect(await within(option).findByText('A')).toHaveAttribute(
      'data-slot',
      'record-artwork-monogram',
    )
  })

  it('draws a text record glyph without adding its title to the option name', async () => {
    await openPicker(
      <TextRecordPicker
        search={searchTextRecords}
        onSelect={() => undefined}
        trigger={<button type="button">Browse</button>}
      />,
      'com.github',
    )

    const option = screen.getByRole('option', { name: 'GitHub Key com.github' })
    await within(option).findByTitle('GitHub')
    expect(artworkOf(option)?.querySelector('svg')).toBeInTheDocument()
  })
})
