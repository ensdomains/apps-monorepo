import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { render } from '@/utils/test-utils'
import { CopyableButton } from './CopyableButton'

describe('CopyableButton', () => {
  it('keeps the copy icon out of the button name', () => {
    render(<CopyableButton value="0x1234">@ensdomains</CopyableButton>)

    expect(
      screen.getByRole('button', { name: '@ensdomains' }),
    ).toBeInTheDocument()
  })
})
