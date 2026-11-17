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

it('shows the description and picker only once Set expiration is ticked, a year out', async () => {
  const onChange = vi.fn()
  const user = userEvent.setup()
  render(<Harness onChange={onChange} />)

  expect(screen.queryByText(/The new owner loses it/)).toBeNull()
  await user.click(screen.getByRole('checkbox', { name: /Set expiration/ }))
  expect(onChange).toHaveBeenLastCalledWith({
    type: 'span',
    span: { type: 'years', years: 1 },
  })
  expect(screen.getByText(/The new owner loses it/)).toBeInTheDocument()

  await user.click(screen.getByRole('checkbox', { name: /Set expiration/ }))
  expect(onChange).toHaveBeenLastCalledWith(DEFAULT_SUBNAME_EXPIRY)
  expect(screen.queryByText(/The new owner loses it/)).toBeNull()
})
