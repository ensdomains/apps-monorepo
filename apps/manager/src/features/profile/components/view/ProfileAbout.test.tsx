import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ProfileRecords } from '@/features/profile/types'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { render } from '@/utils/test-utils'
import { ProfileAbout } from './ProfileAbout'

const createRecords = (
  base: ProfileRecords['base'],
  contact: ProfileRecords['contact'] = [],
): ProfileRecords => ({
  ...newEmptyProfileRecords(),
  base,
  contact,
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

  it('still shows the description when no full name is saved', () => {
    render(
      <ProfileAbout
        records={createRecords({
          description: 'Building the decentralised web.',
        })}
      />,
    )

    expect(
      screen.getByText('Building the decentralised web.'),
    ).toBeInTheDocument()
  })

  it('shows the other general records alongside the full name', () => {
    render(
      <ProfileAbout
        records={createRecords(
          {
            language: 'en',
            name: 'Laura Miller',
            url: 'https://example.com',
          },
          [
            { key: 'location', value: 'New York, NY' },
            { key: 'timezone', value: 'UTC-5' },
          ],
        )}
      />,
    )

    expect(screen.getByText('Laura Miller')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      'https://example.com',
    )
    expect(screen.getByText('example.com')).toBeInTheDocument()
    expect(screen.getByText('UTC-5')).toBeInTheDocument()
    expect(screen.getByText('EN')).toBeInTheDocument()
    expect(screen.getByText('NEW YORK, NY')).toBeInTheDocument()
  })
})
