import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { render } from '@/utils/test-utils'
import { ProfileAbout } from './ProfileAbout'

describe('ProfileAbout', () => {
  it('renders nothing when every about record is empty', () => {
    const { container } = render(
      <ProfileAbout
        records={{
          ...newEmptyProfileRecords(),
          base: { description: '   ', name: '' },
        }}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('prompts the owner to fill in an empty description', () => {
    render(
      <ProfileAbout
        isOwner
        records={{ ...newEmptyProfileRecords(), base: { description: '   ' } }}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Profile Description' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Share a fun fact about this name'),
    ).toBeInTheDocument()
  })

  it('renders when only a meta record is set', () => {
    render(
      <ProfileAbout
        records={{
          ...newEmptyProfileRecords(),
          contact: [{ key: 'timezone', value: 'UTC+2' }],
        }}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Profile Description' }),
    ).toBeInTheDocument()
    expect(screen.getByText('UTC+2')).toBeInTheDocument()
  })
})
