import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const OWNER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const OTHER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const REGISTRY = '0x1111111111111111111111111111111111111111'

let currentName = 'sub.alice.eth'
let protocolVersion: 'ENSv1' | 'ENSv2' = 'ENSv2'

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

vi.mock('@/features/transfer/components/V2SendName', () => ({
  V2SendName: () => <div data-testid="send-name-form" />,
}))

vi.mock('@/features/transfer/v1/V1SendName', () => ({
  V1SendName: () => <div data-testid="v1-send-name-form" />,
}))

type QueryStub = {
  data: unknown
  isLoading: boolean
  isError: boolean
}

const expiryQuery: QueryStub = {
  data: undefined,
  isLoading: false,
  isError: false,
}

const v1StateQuery: QueryStub = {
  data: undefined,
  isLoading: false,
  isError: false,
}

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQuery: (options: { queryKey: readonly unknown[] }) => {
      switch (options.queryKey[0]) {
        case 'get-subname-expiry':
          return expiryQuery
        case 'transfer-v1-name-state':
          return v1StateQuery
        default:
          return {
            data: {
              owner: OWNER,
              registryAddress: REGISTRY,
              protocolVersion,
            },
            isLoading: false,
            error: null,
          }
      }
    },
  }
})

// See the note in ../fuses/index.test.tsx — `Route` is the mocked options object.
const { Route } = await import('./transfer')
const TransferRoute = (
  Route as unknown as { component: () => React.ReactElement }
).component

const NOW_SECONDS = 1_800_000_000

describe('transfer route — canonical name gate (Immunefi #91224)', () => {
  it('refuses a name whose label is not its normalised form', () => {
    currentName = 'ALICE.eth'

    render(<TransferRoute />)

    expect(
      screen.getByText('This name can’t be transferred'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('send-name-form')).not.toBeInTheDocument()
  })
})

describe('transfer route — subname expiry gate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW_SECONDS * 1000)
    currentName = 'sub.alice.eth'
    protocolVersion = 'ENSv2'
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

  // `PermissionedRegistry._isExpired(0)` is true: the registry has no "never
  // expires" value, and 0 is what it reads for a label it holds no entry for.
  // The query normalises the label before hashing, so a 0 is a lapsed name, not
  // a hashing mismatch, and is refused like any other expired one.
  it('refuses a zero expiry — the registry treats it as expired', () => {
    expiryQuery.data = 0n

    render(<TransferRoute />)

    expect(screen.getByText('This subname has expired')).toBeInTheDocument()
    expect(screen.queryByTestId('send-name-form')).not.toBeInTheDocument()
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

describe('transfer route — v1 gate', () => {
  beforeEach(() => {
    currentName = 'alice.eth'
    protocolVersion = 'ENSv1'
    Object.assign(v1StateQuery, {
      data: undefined,
      isLoading: false,
      isError: false,
    })
  })

  const v1State = (
    subject: unknown,
    registration: 'active' | 'gracePeriod' | 'expired' | null = null,
  ) => {
    v1StateQuery.data = {
      subject,
      registration,
      resolverAddress: null,
      parentOwner: null,
    }
  }

  it('offers the V1 form to the registrant of an unwrapped 2LD', () => {
    v1State(
      { kind: 'v1-registrar', registrant: OWNER, controller: OTHER },
      'active',
    )

    render(<TransferRoute />)

    expect(screen.getByTestId('v1-send-name-form')).toBeInTheDocument()
  })

  // `getEnsOwner` reports the *controller* as the owner of an unwrapped 2LD, so
  // without the V1 gate this wallet would be waved through to a transfer it
  // can't make.
  it('refuses the controller of an unwrapped 2LD and names the registrant', () => {
    v1State(
      { kind: 'v1-registrar', registrant: OTHER, controller: OWNER },
      'active',
    )

    render(<TransferRoute />)

    expect(
      screen.getByText('You manage this name but don’t own it'),
    ).toBeInTheDocument()
    expect(screen.getByText(OTHER)).toBeInTheDocument()
    expect(screen.queryByTestId('v1-send-name-form')).not.toBeInTheDocument()
  })

  it('refuses a 2LD in its grace period', () => {
    v1State(null, 'gracePeriod')

    render(<TransferRoute />)

    expect(
      screen.getByText('This name is in its grace period'),
    ).toBeInTheDocument()
  })

  it('refuses a wrapped name whose CANNOT_TRANSFER fuse is burned', () => {
    v1State(
      {
        kind: 'v1-wrapped',
        owner: OWNER,
        fuses: {
          cannotTransfer: true,
          cannotSetResolver: false,
          cannotUnwrap: true,
          parentCannotControl: true,
        },
        expiry: BigInt(NOW_SECONDS + 86_400),
      },
      'active',
    )

    render(<TransferRoute />)

    expect(
      screen.getByText('Transfer permanently disabled'),
    ).toBeInTheDocument()
  })

  it('refuses rather than guessing when the state read fails', () => {
    Object.assign(v1StateQuery, { data: undefined, isError: true })

    render(<TransferRoute />)

    expect(screen.getByText('Couldn’t check this name')).toBeInTheDocument()
  })
})

// #89474: the steps derive their label from `getLabel(name)` (ENSIP-15), while
// the page renders the URL's spelling. A non-canonical label is registrable
// on-chain, so an attacker can gift the victim `ALICE.eth` — the owner read
// then passes on the raw name while every write would key off `alice.eth`, the
// victim's real name. The route has to refuse before the form is offered.
describe('transfer route — non-canonical name gate', () => {
  beforeEach(() => {
    protocolVersion = 'ENSv2'
    Object.assign(expiryQuery, {
      data: BigInt(NOW_SECONDS + 86_400),
      isLoading: false,
      isError: false,
    })
  })

  it.each([
    ['an uppercase label', 'ALICE.eth'],
    ['a fullwidth label', 'ａlice.eth'],
    ['a non-canonical subname label', 'SUB.alice.eth'],
  ])('refuses %s instead of offering the form', (_case, name) => {
    currentName = name

    render(<TransferRoute />)

    expect(
      screen.getByText('This name can’t be transferred'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('send-name-form')).not.toBeInTheDocument()
    expect(screen.queryByTestId('v1-send-name-form')).not.toBeInTheDocument()
  })

  it('refuses a non-canonical V1 name too — the V1 read normalizes as well', () => {
    currentName = 'ALICE.eth'
    protocolVersion = 'ENSv1'
    // A state that would otherwise hand this wallet the V1 form.
    v1StateQuery.data = {
      subject: { kind: 'v1-registrar', registrant: OWNER, controller: OWNER },
      registration: 'active',
      resolverAddress: null,
      parentOwner: null,
    }

    render(<TransferRoute />)

    expect(
      screen.getByText('This name can’t be transferred'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('v1-send-name-form')).not.toBeInTheDocument()
  })

  it('still offers the form for the canonical spelling', () => {
    currentName = 'alice.eth'

    render(<TransferRoute />)

    expect(screen.getByTestId('send-name-form')).toBeInTheDocument()
  })
})
