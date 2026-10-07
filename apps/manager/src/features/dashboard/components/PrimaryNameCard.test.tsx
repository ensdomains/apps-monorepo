import { screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import { PrimaryNameCard } from './PrimaryNameCard'

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return { ...actual, useQuery: () => ({ data: null, isLoading: false }) }
})

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: { children: ReactNode }) => (
      <div {...props}>{children}</div>
    ),
  },
  useReducedMotion: () => true,
}))

vi.mock('@/components/ui/button', () => ({
  LinkButton: ({ children }: { children: ReactNode }) => (
    <a href="/alpha.eth">{children}</a>
  ),
}))

vi.mock('./ChoosePrimaryNameDialog', () => ({
  ChoosePrimaryNameDialog: ({ children }: { children?: ReactNode }) => children,
}))

describe('PrimaryNameCard', () => {
  it('uses only the label button as chooser trigger and leaves the value plain', () => {
    render(<PrimaryNameCard primaryName="alpha.eth" />)

    expect(
      screen.getByRole('button', { name: 'Primary Name' }),
    ).toBeInTheDocument()
    const displayedName = screen.getByText('alpha.eth')
    expect(displayedName.closest('button')).toBeNull()
    expect(displayedName.closest('a')).toBeNull()
    expect(screen.queryByText('keyboard_arrow_down')).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /go to profile/i }),
    ).toBeInTheDocument()
  })
})
