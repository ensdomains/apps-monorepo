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

  it('renders nothing for a visitor when the only record is a non-http url', () => {
    const { container } = render(
      <ProfileAbout
        records={{ ...newEmptyProfileRecords(), base: { url: 'ftp://x.y' } }}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('prompts an editing owner to fill in an empty description', () => {
    render(
      <ProfileAbout
        canEdit
        records={{ ...newEmptyProfileRecords(), base: { description: '   ' } }}
      />,
    )

    expect(screen.getByRole('heading', { name: 'About' })).toBeInTheDocument()
    expect(
      screen.getByText('Share a fun fact about this name'),
    ).toBeInTheDocument()
  })

  it('heads the card with the nickname alone when one is set', () => {
    render(
      <ProfileAbout
        records={{
          ...newEmptyProfileRecords(),
          base: { description: 'Builder of things', name: 'Ali' },
        }}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Ali' })).toBeInTheDocument()
    expect(screen.queryByText('About')).not.toBeInTheDocument()
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

    expect(screen.getByRole('heading', { name: 'About' })).toBeInTheDocument()
    expect(screen.getByText('UTC+2')).toBeInTheDocument()
  })

  it('keeps place names as saved and shows language codes in uppercase', () => {
    render(
      <ProfileAbout
        records={{
          ...newEmptyProfileRecords(),
          base: { language: 'en' },
          contact: [
            { key: 'timezone', value: 'UTC+2' },
            { key: 'location', value: 'Canada' },
          ],
        }}
      />,
    )

    expect(screen.getByText('Canada')).toBeInTheDocument()
    expect(screen.queryByText('CANADA')).not.toBeInTheDocument()
    expect(screen.getByText('EN')).toBeInTheDocument()
  })
})
