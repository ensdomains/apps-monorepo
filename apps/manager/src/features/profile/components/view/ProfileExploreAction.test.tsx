import { act, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { render } from '@/utils/test-utils'
import { ProfileExploreAction } from './ProfileExploreAction'

const FIRST = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
const SECOND = '0xb8c2C29ee19D8307cb7255e1Cd9CbDE883A267d5'

describe('ProfileExploreAction', () => {
  it('opens the address in Explorer and follows a change of address', () => {
    const view = render(
      <ProfileExploreAction target={{ kind: 'address', address: FIRST }} />,
    )
    const link = screen.getByRole('link', { name: 'Explore' })

    expect(link).toHaveAttribute(
      'href',
      `https://sepolia.explorer.ens.domains/addr/${FIRST}`,
    )
    expect(link).toHaveAttribute('target', '_blank')

    view.rerender(
      <ProfileExploreAction target={{ kind: 'address', address: SECOND }} />,
    )

    expect(screen.getByRole('link', { name: 'Explore' })).toHaveAttribute(
      'href',
      `https://sepolia.explorer.ens.domains/addr/${SECOND}`,
    )
  })

  it('describes where it goes when focused', async () => {
    render(<ProfileExploreAction target={{ kind: 'name', name: 'nick.eth' }} />)
    const link = screen.getByRole('link', { name: 'Explore' })

    act(() => link.focus())

    expect(
      await screen.findByRole('tooltip', {
        name: 'View details and history in ENS Explorer',
      }),
    ).toBeInTheDocument()
  })
})
