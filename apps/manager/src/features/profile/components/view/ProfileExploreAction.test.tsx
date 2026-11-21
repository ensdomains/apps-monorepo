import { act, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { render } from '@/utils/test-utils'
import { ProfileExploreAction } from './ProfileExploreAction'

describe('ProfileExploreAction', () => {
  it('opens the name in Explorer in a new tab and follows a change of name', () => {
    const view = render(<ProfileExploreAction name="nick.eth" />)
    const link = screen.getByRole('link', { name: 'Explore' })

    expect(link).toHaveAttribute(
      'href',
      'https://sepolia.explorer.ens.domains/nick.eth',
    )
    expect(link).toHaveAttribute('target', '_blank')

    view.rerender(<ProfileExploreAction name="vitalik.eth" />)

    expect(screen.getByRole('link', { name: 'Explore' })).toHaveAttribute(
      'href',
      'https://sepolia.explorer.ens.domains/vitalik.eth',
    )
  })

  it('describes where it goes when focused', async () => {
    render(<ProfileExploreAction name="nick.eth" />)
    const link = screen.getByRole('link', { name: 'Explore' })

    act(() => link.focus())

    expect(
      await screen.findByRole('tooltip', {
        name: 'View details and history in ENS Explorer',
      }),
    ).toBeInTheDocument()
  })

  it('tells the owner they can manage the name in Explorer', async () => {
    render(<ProfileExploreAction isOwner name="nick.eth" />)

    act(() => screen.getByRole('link', { name: 'Explore' }).focus())

    expect(
      await screen.findByRole('tooltip', {
        name: 'Manage advanced settings in ENS Explorer',
      }),
    ).toBeInTheDocument()
  })
})
