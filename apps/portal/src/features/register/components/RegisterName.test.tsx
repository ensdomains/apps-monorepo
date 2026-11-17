import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RegisterName } from './RegisterName'

describe('RegisterName', () => {
  it('refuses a name that reads like a wallet address without mounting the flow', () => {
    render(
      <RegisterName name="0xd8da6bf26964af9d7eed9e03e53415d37aa96045.eth" />,
    )

    expect(screen.getByText('Name can’t be registered')).toBeInTheDocument()
  })
})
