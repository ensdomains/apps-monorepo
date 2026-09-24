import { render, screen } from '@testing-library/react'
import { namehash, normalize } from 'viem/ens'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
// neither, leaving just the normalization card. `ownerData` opts a test in.
let ownerData: unknown
const settled = (data: unknown) => ({
  data,
  error: null,
  isLoading: false,
  isSuccess: true,
})
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQuery: (options: { queryKey: readonly unknown[] }) => {
      if (options.queryKey[0] === 'get-ens-owner') return settled(ownerData)
      // A truthy wrapper record puts the V1 card on the NameWrapper branch,
      // whose token id is the namehash.
      if (options.queryKey[0] === 'get-wrapper-data')
        return settled({ owner: '0x0000000000000000000000000000000000000001' })
      return settled(undefined)
    },
  }
})

vi.mock('@/hooks/useContractAddress', () => ({
  useContractAddress: () => '0x0000000000000000000000000000000000000002',
}))

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
  beforeEach(() => {
    ownerData = undefined
  })

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

  it('derives the wrapped V1 token id from the normalized name', () => {
    routeName = 'ALICE.eth'
    ownerData = { protocolVersion: 'ENSv1' }

    render(<TokenRoute />)

    const tokenId = BigInt(namehash('alice.eth')).toString(10)
    expect(screen.getByText(tokenId)).toBeInTheDocument()
    expect(
      screen.queryByText(BigInt(namehash('ALICE.eth')).toString(10)),
    ).not.toBeInTheDocument()
  })
})
