import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, it } from 'vitest'
import { AddRecordButton } from './AddRecordButton'

it('keeps keyboard focus when adding a row makes the button unavailable', async () => {
  const ResetAfterAdd = () => {
    const [isAdded, setIsAdded] = useState(false)
    return (
      <AddRecordButton
        disabledReason={isAdded ? 'Select a record type.' : null}
        onClick={() => setIsAdded(true)}
      />
    )
  }

  const user = userEvent.setup()
  render(<ResetAfterAdd />)

  await user.tab()
  await user.keyboard('{Enter}')

  const button = screen.getByRole('button', { name: 'Add record' })
  expect(button).toHaveAttribute('aria-disabled', 'true')
  expect(button).toHaveFocus()
})
