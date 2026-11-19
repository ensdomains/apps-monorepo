import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { render } from '@/utils/test-utils'
import { AddressLikeNameNotice } from './AddressLikeNameNotice'

describe('AddressLikeNameNotice', () => {
  it.each([
    ['an EVM', '0xd8da6bf26964af9d7eed9e03e53415d37aa96045.eth'],
    ['a Bitcoin bech32', 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq.eth'],
    ['a Bitcoin legacy base58', '1a1zp1ep5qgefi2dmptftl5slmv7divfna.eth'],
    ['a Solana base58', '9wzdxwbbmkg8ztbnmquxvqrayrzzdsgydlvl9zytawwm.eth'],
    ['a subname EVM', 'pay.0xd8da6bf26964af9d7eed9e03e53415d37aa96045.eth'],
  ])('warns on a name that reads like %s address', (_case, name) => {
    render(<AddressLikeNameNotice name={name} />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Note: This name may resolve to another address, confirm the final address is the intended address.',
    )
  })

  it.each([
    ['an ordinary name', 'vitalik.eth'],
    [
      'a long ordinary name with a year',
      'summerroadtripwithallmyfriends1999.eth',
    ],
  ])('renders nothing for %s', (_case, name) => {
    render(<AddressLikeNameNotice name={name} />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
