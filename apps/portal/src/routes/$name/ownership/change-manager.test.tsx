import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

let currentName = 'alice.eth'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useParams: () => ({ name: currentName }),
  }),
}))

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>()
  return {
    ...actual,
    useConnection: () => ({
      address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    }),
  }
})

vi.mock('@/features/ownership/components/ChangeManager', () => ({
  ChangeManager: () => <div data-testid="change-manager-form" />,
}))

// See the note in ../fuses/index.test.tsx — `Route` is the mocked options object.
const { Route } = await import('./change-manager')
const ChangeManagerRoute = (
  Route as unknown as { component: () => React.ReactElement }
).component

describe('change-manager route — canonical name gate', () => {
  it('refuses a name whose label is not its normalised form', () => {
    currentName = 'ALICE.eth'

    render(<ChangeManagerRoute />)

    expect(
      screen.getByText('This name’s manager can’t be changed'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('change-manager-form')).not.toBeInTheDocument()
  })
})
