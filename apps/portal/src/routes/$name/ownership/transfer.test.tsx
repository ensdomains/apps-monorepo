import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const OWNER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const REGISTRY = '0x1111111111111111111111111111111111111111'

let currentName = 'sub.alice.eth'
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
  return { ...actual, useConnection: () => ({ address: OWNER }) }
})

// The transfer-role gate has its own tests; hold it open so these cases isolate
// the expiry gate.
vi.mock('@/features/transfer/hooks/useCanTransferName', () => ({
  useCanTransferName: () => ({
    canTransfer: true,
    isLoading: false,
    isError: false,
  }),
}))

vi.mock('@/features/transfer/components/SendNameForm', () => ({
  SendNameForm: () => <div data-testid="send-name-form" />,
}))

const expiryQuery: {
  data: bigint | undefined
  isLoading: boolean
  isError: boolean
} = { data: undefined, isLoading: false, isError: false }

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQuery: (options: { queryKey: readonly unknown[] }) =>
      options.queryKey[0] === 'get-subname-expiry'
        ? expiryQuery
        : {
            data: {
              owner: OWNER,
              registryAddress: REGISTRY,
              protocolVersion: 'ENSv2',
            },
            isLoading: false,
            error: null,
          },
  }
})

// See the note in ../fuses/index.test.tsx — `Route` is the mocked options object.
const { Route } = await import('./transfer')
const TransferRoute = (
  Route as unknown as { component: () => React.ReactElement }
).component

const NOW_SECONDS = 1_800_000_000

describe('transfer route — subname expiry gate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW_SECONDS * 1000)
    currentName = 'sub.alice.eth'
    Object.assign(expiryQuery, {
      data: BigInt(NOW_SECONDS + 86_400),
      isLoading: false,
      isError: false,
    })
  })

  it('offers the form for a subname whose registration is still live', () => {
    render(<TransferRoute />)

    expect(screen.getByTestId('send-name-form')).toBeInTheDocument()
  })

  it('refuses an expired subname instead of offering the form', () => {
    expiryQuery.data = BigInt(NOW_SECONDS - 1)

    render(<TransferRoute />)

    expect(screen.getByText('This subname has expired')).toBeInTheDocument()
    expect(screen.queryByTestId('send-name-form')).not.toBeInTheDocument()
  })

  // The registry returns 0 only for a label it has no entry for, which the owner
  // gate rejects first — so a 0 reaching here means the label we hashed isn't
  // the one the user owns. Read naively as a timestamp it would be "expired at
  // the epoch" and would block a live transfer.
  it('lets a zero expiry through instead of reading it as the epoch', () => {
    expiryQuery.data = 0n

    render(<TransferRoute />)

    expect(screen.getByTestId('send-name-form')).toBeInTheDocument()
  })

  it('refuses rather than assuming "not expired" when the expiry read fails', () => {
    Object.assign(expiryQuery, { data: undefined, isError: true })

    render(<TransferRoute />)

    expect(
      screen.getByText('Couldn’t check this subname’s expiry'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('send-name-form')).not.toBeInTheDocument()
  })

  it('does not gate a 2LD on expiry — the query never runs for one', () => {
    currentName = 'alice.eth'
    Object.assign(expiryQuery, { data: undefined, isError: false })

    render(<TransferRoute />)

    expect(screen.getByTestId('send-name-form')).toBeInTheDocument()
  })
})
