import { render, screen } from '@testing-library/react'
import { namehash, normalize } from 'viem/ens'
import { describe, expect, it, vi } from 'vitest'

let routeName = 'alice.eth'
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useParams: () => ({ name: routeName }),
  }),
}))

// The owner query decides which token card renders; `undefined` renders
// neither, leaving the normalization card this test is about.
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQuery: () => ({
      data: undefined,
      error: null,
      isLoading: false,
      isSuccess: true,
    }),
  }
})

vi.mock('@/components/EntityBadge', () => ({
  EntityBadge: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
}))

// `Route` is the mocked options object (see createFileRoute above).
const { Route } = await import('./token')
const TokenRoute = (Route as unknown as { component: () => React.ReactElement })
  .component

describe('token route', () => {
  it('hashes the normalized name, not its punycode form', () => {
    routeName = 'münchen.eth'

    render(<TokenRoute />)

    expect(
      screen.getByText(namehash(normalize('münchen.eth'))),
    ).toBeInTheDocument()
    // The node of xn--mnchen-3ya.eth — a different, separately registrable name.
    expect(
      screen.queryByText(namehash('xn--mnchen-3ya.eth')),
    ).not.toBeInTheDocument()
  })

  it('still folds case, as hashing the A-label used to', () => {
    routeName = 'ALICE.eth'

    render(<TokenRoute />)

    expect(screen.getByText(namehash('alice.eth'))).toBeInTheDocument()
  })

  it('falls back to the lowercased name when ENSIP-15 rejects it', () => {
    routeName = 'a_b.eth'

    render(<TokenRoute />)

    expect(screen.getByText(namehash('a_b.eth'))).toBeInTheDocument()
  })
})
