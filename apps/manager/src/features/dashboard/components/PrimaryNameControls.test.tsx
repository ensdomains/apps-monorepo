import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { render } from '@/utils/test-utils'
import { PrimaryBadge } from './PrimaryBadge'
import { PrimaryNameButton } from './PrimaryNameButton'

describe('primary name labels', () => {
  it('renders the interactive state icons before the label without exposing them to assistive technology', () => {
    render(<PrimaryNameButton />)

    const button = screen.getByRole('button', { name: 'Primary Name' })
    const icon = button.firstElementChild

    expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(icon).toHaveClass('place-items-center')
    expect(icon).toHaveTextContent('person_check')
    expect(icon).toHaveTextContent('published_with_changes')
    expect(button.lastElementChild).toHaveTextContent('Primary Name')
  })

  it('renders the passive checkmark before the label without exposing it to assistive technology', () => {
    render(<PrimaryBadge />)

    const label = screen.getByText('Primary Name')
    const badge = label.parentElement
    const icon = badge?.firstElementChild

    expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(icon).toHaveClass('items-center', 'justify-center')
    expect(badge?.lastElementChild).toBe(label)
  })
})
