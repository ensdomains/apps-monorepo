import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ProfileRecords } from '@/features/profile/types'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { render } from '@/utils/test-utils'
import { ProfileAbout } from './ProfileAbout'

const createRecords = (base: ProfileRecords['base']): ProfileRecords => ({
  ...newEmptyProfileRecords(),
  base,
})

describe('ProfileAbout', () => {
  it('shows the saved full name', () => {
    render(<ProfileAbout records={createRecords({ name: 'Laura Miller' })} />)

    expect(screen.getByText('Laura Miller')).toBeInTheDocument()
  })

  it('shows the full name alongside the description', () => {
    render(
      <ProfileAbout
        records={createRecords({
          description: 'Building the decentralised web.',
          name: 'Laura Miller',
        })}
      />,
    )

    expect(screen.getByText('Laura Miller')).toBeInTheDocument()
    expect(
      screen.getByText('Building the decentralised web.'),
    ).toBeInTheDocument()
  })

  it.each([
    [undefined],
    [''],
    ['   '],
  ])('renders no full name when the record is %p', (name) => {
    const { container } = render(
      <ProfileAbout records={createRecords({ name })} />,
    )

    expect(container.textContent).toBe('About')
  })
})
