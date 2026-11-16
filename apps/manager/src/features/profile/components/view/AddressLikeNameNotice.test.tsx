import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { render } from '@/utils/test-utils'
import { AddressLikeNameNotice } from './AddressLikeNameNotice'

describe('AddressLikeNameNotice', () => {
  it('warns on a name that reads like a wallet address', () => {
    render(
      <AddressLikeNameNotice name="0xd8da6bf26964af9d7eed9e03e53415d37aa96045.eth" />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      'Note: This name may resolve to another address, confirm the final address is the intended address.',
    )
  })

  it('renders nothing for an ordinary name', () => {
    render(<AddressLikeNameNotice name="vitalik.eth" />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
