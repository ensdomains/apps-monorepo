import type { AnchorHTMLAttributes } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import { NameRow } from './NameRow'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}))

describe('NameRow', () => {
  it('places grace period badge on the right side of the top row', () => {
    const { getByText } = render(
      <NameRow isInGrace label="expires-in-30-days.eth" nameRole="owner" />,
    )

    const graceBadge = getByText('Grace period').closest('span')
    const ownerBadge = getByText('Owner').closest('span')
    const topRow = graceBadge?.closest('.items-start.justify-between')

    expect(topRow?.firstElementChild).toContainElement(ownerBadge)
    expect(topRow?.firstElementChild).not.toContainElement(graceBadge)
    expect(topRow?.lastElementChild).toBe(graceBadge)
    expect(graceBadge).toHaveClass('bg-[#fffddc]', 'text-ens-citrine-500')
  })
})
