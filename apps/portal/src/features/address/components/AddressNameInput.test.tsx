import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AddressResolution } from '../hooks/useAddressResolution'
import { AddressNameInput } from './AddressNameInput'

const makeResolution = (isAddressLike: boolean): AddressResolution => ({
  address: '0x1111111111111111111111111111111111111111',
  isResolving: false,
  isValid: true,
  isRawAddress: false,
  isAddressLike,
  isInvalid: false,
  status: 'resolved',
})

describe('AddressNameInput', () => {
  it.each([true, false])(
    'shows the resolved address, with the address-like note: %s',
    (isAddressLike) => {
      render(
        <AddressNameInput
          value="name.eth"
          onChange={() => {}}
          resolution={makeResolution(isAddressLike)}
        />,
      )

      expect(screen.getByText(/Resolved: 0x1111/)).toBeInTheDocument()
      expect(
        screen.queryByText(/This name may resolve to another address/) !== null,
      ).toBe(isAddressLike)
    },
  )
})
