import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, it, vi } from 'vitest'
import {
  DEFAULT_SUBNAME_EXPIRY,
  type SubnameExpiry,
} from '../utils/subnameExpiry'
import { SubnameExpiryField } from './SubnameExpiryField'

const Harness = ({
  onChange,
}: {
  readonly onChange: (expiry: SubnameExpiry) => void
}) => {
  const [expiry, setExpiry] = useState(DEFAULT_SUBNAME_EXPIRY)
  return (
    <SubnameExpiryField
      expiry={expiry}
      onExpiryChange={(next) => {
        setExpiry(next)
        onChange(next)
      }}
    />
  )
}

it('hides the expiry under Advanced settings, and ticking it sets one year', async () => {
  const onChange = vi.fn()
  const user = userEvent.setup()
  render(<Harness onChange={onChange} />)

  expect(screen.queryByLabelText(/Set an expiry/)).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Advanced settings' }))
  await user.click(screen.getByLabelText(/Set an expiry/))
  expect(onChange).toHaveBeenLastCalledWith({
    type: 'span',
    span: { type: 'years', years: 1 },
  })

  await user.click(screen.getByLabelText(/Set an expiry/))
  expect(onChange).toHaveBeenLastCalledWith(DEFAULT_SUBNAME_EXPIRY)
})
