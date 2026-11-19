import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AddressNameInput } from './AddressNameInput'

describe('AddressNameInput', () => {
  it.each([true, false])(
    'shows the resolved address, with the address-like note: %s',
    (isAddressLike) => {
      render(
        <AddressNameInput
          value="name.eth"
          onChange={() => {}}
          resolution={{
            address: '0x1111111111111111111111111111111111111111',
            isResolving: false,
            isValid: true,
            isRawAddress: false,
            isAddressLike,
            isInvalid: false,
            status: 'resolved',
          }}
        />,
      )

      expect(screen.getByText(/Resolved: 0x1111/)).toBeInTheDocument()
      expect(
        screen.queryByText(/This name may resolve to another address/) !== null,
      ).toBe(isAddressLike)
    },
  )
})
