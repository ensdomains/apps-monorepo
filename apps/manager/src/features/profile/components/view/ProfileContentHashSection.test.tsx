import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { copyToClipboard } from '@/lib/clipboard'
import { render } from '@/utils/test-utils'
import { ProfileCards } from './ProfileCards'
import { ProfileContentHashSection } from './ProfileContentHashSection'

vi.mock('@/lib/clipboard', () => ({ copyToClipboard: vi.fn() }))

describe('ProfileContentHashSection', () => {
  it.each([
    undefined,
    '',
    '   ',
    '0x',
  ])('hides unset value %s', (contentHash) => {
    const { container } = render(
      <ProfileContentHashSection
        records={{ ...newEmptyProfileRecords(), contentHash }}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('displays an existing IPFS record in the profile and copies its full value', async () => {
    const contentHash = 'ipfs://QmYwAPJzv5CZsnAzt8auVZRnGiRAz9LxqD9H9tGZpWZHYB'
    render(
      <ProfileCards
        name="bright-lemur.eth"
        records={{ ...newEmptyProfileRecords(), contentHash }}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Content hash' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: contentHash }))
    await waitFor(() =>
      expect(copyToClipboard).toHaveBeenCalledWith(contentHash),
    )
  })

  it.each([
    `ipns://${'a'.repeat(500)}`,
    'unknown://example',
    '0xe301',
    'javascript:alert(1)',
    '<img src=x onerror=alert(1)>',
  ])('safely displays %s as text without navigation or editing', (contentHash) => {
    const { container } = render(
      <ProfileContentHashSection
        records={{ ...newEmptyProfileRecords(), contentHash }}
      />,
    )

    expect(screen.getByText(contentHash)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })
})
