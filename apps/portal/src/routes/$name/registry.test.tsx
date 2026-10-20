import type { Role } from '@ensdomains/ensjs/utils/v2'
import { fireEvent, render, screen } from '@testing-library/react'
import { zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, string>
  }) => (
    <a href={to} data-params={params ? JSON.stringify(params) : undefined}>
      {children}
    </a>
  ),
  createFileRoute: () => () => ({}),
  useParams: () => ({ name: 'irrelevant.eth' }),
}))

const mockAccount = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>()
  return {
    ...actual,
    useConnection: () => ({ address: mockAccount }),
    useEnsName: () => ({ data: undefined }),
  }
})

// RegistryTreeItem links the contract badge to a block explorer; the hook reads
// useChainId/useConfig (needs a WagmiProvider) and the explorer href is
// irrelevant to these layout assertions. Stub it. Its own logic is covered by
// the getBlockExplorer*Url tests.
vi.mock('@/utils/blockExplorer/useBlockExplorerUrl', () => ({
  useBlockExplorerAddressUrl: () => undefined,
  useBlockExplorerTxUrl: () => undefined,
}))

// Stub heavy leaf components so we can render the tree in isolation and assert
// only the concerns of the redesigned registry section (tree rows + the inline
// configure form for the deepest, unconfigured registry).
//
// NameAvatar pulls in `useEnsAvatar`, which needs a WagmiProvider, and
// ConfigureRegistryForm owns its own deploy/role-gating queries and modal —
// both are exercised by their own tests.
vi.mock('@/features/profile/components/NameAvatar', () => ({
  NameAvatar: ({ name }: { name: string }) => (
    <span data-testid="name-avatar" data-name={name} />
  ),
}))

vi.mock('@/features/registry/components/v2/ConfigureRegistryForm', () => ({
  ConfigureRegistryForm: ({ name }: { name: string }) => (
    <div data-testid="configure-registry-form" data-name={name} />
  ),
}))

vi.mock('@/features/registry/components/v2/ReconfigureRegistryForm', () => ({
  ReconfigureRegistryForm: ({ name }: { name: string }) => (
    <div data-testid="reconfigure-registry-form" data-name={name} />
  ),
}))

const mockHasSetSubregistryRole: {
  hasRole: boolean | undefined
  error: Error | null
} = { hasRole: false, error: null }
vi.mock('@/features/registry/hooks/useHasSetSubregistryRole', () => ({
  useHasSetSubregistryRole: () => ({
    hasRole: mockHasSetSubregistryRole.hasRole,
    isLoading: false,
    error: mockHasSetSubregistryRole.error,
    parentRegistry: null,
    connectedAddress: mockAccount,
  }),
}))

// EntityBadge is the actions-enabled badge: it pulls in `useNavigate` and wagmi
// hooks (useChainId/useConfig) that need a router + WagmiProvider. These tests
// only care about the tree-row layout, so stub it to render its label/children
// (which carry the truncated addresses the assertions look for). The badge's own
// behaviour is covered by its dedicated tests.
vi.mock('@/components/EntityBadge', () => ({
  EntityBadge: ({
    children,
    label,
  }: {
    children?: React.ReactNode
    label?: string
  }) => (
    <span>
      {label ? <span>{label}</span> : null}
      <span>{children}</span>
    </span>
  ),
}))

// Mock useQuery to dispatch on the first segment of the query key.
const nameRegistriesResult: {
  data: unknown
  error: unknown
  isLoading: boolean
} = {
  data: undefined,
  error: undefined,
  isLoading: false,
}

// Whether the name was ever pointed at a registry. An empty slot is only
// "never configured" when this is false; true means the pointer was zeroed and
// the name is damaged, not new. See `useSubregistrySlot`.
type SubregistryHistoryResult = {
  readonly data: number | null | undefined
  readonly isError: boolean
}

// Replaced wholesale per test rather than mutated field-by-field, so no case
// can leak a half-reset fixture into the next one.
let subregistryHistoryResult: SubregistryHistoryResult = {
  data: 0,
  isError: false,
}

const setSubregistryHistory = (result: Partial<SubregistryHistoryResult>) => {
  subregistryHistoryResult = { data: 0, isError: false, ...result }
}

// The token's role holders. The owner (see `ownerData`) holds every token role
// unless a test takes some away.
const OWNER = '0x1111111111111111111111111111111111111111'
const ALL_TOKEN_ROLES: readonly Role[] = [
  'ROLE_SET_SUBREGISTRY',
  'ROLE_SET_SUBREGISTRY_ADMIN',
  'ROLE_SET_RESOLVER',
  'ROLE_SET_RESOLVER_ADMIN',
  'ROLE_CAN_TRANSFER_ADMIN',
]
let nameRoleAccounts = new Map<string, readonly Role[]>()
const ownerHoldsAllBut = (...missing: Role[]) => {
  nameRoleAccounts = new Map([
    [OWNER, ALL_TOKEN_ROLES.filter((role) => !missing.includes(role))],
  ])
}

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQuery: (options: {
      queryKey: readonly unknown[]
      select?: (data: unknown) => unknown
    }) => {
      const key = options.queryKey[0]
      if (key === 'nameRegistries') {
        return nameRegistriesResult
      }
      if (key === 'get-name-roles-accounts') {
        const holders = { holders: nameRoleAccounts, isVerified: true }
        return {
          data: options.select ? options.select(holders) : holders,
          error: null,
          isLoading: false,
        }
      }
      if (key === 'get-subregistry-history') {
        return subregistryHistoryResult
      }
      return { data: undefined, error: undefined, isLoading: false }
    },
    // The embedded History section pages its feed; this component's tests are
    // about the registry panel above it, so the timeline stays empty.
    useInfiniteQuery: () => ({
      data: undefined,
      error: undefined,
      isLoading: false,
      isFetchingNextPage: false,
      fetchNextPage: () => Promise.resolve(),
    }),
  }
})

const { V2RegistryInfo } = await import(
  '@/features/registry/components/v2/RegistryInfo'
)

const ownerData = {
  owner: OWNER,
  registryAddress: '0x1111111111111111111111111111111111111111',
  protocolVersion: 'ENSv2' as const,
} as const

const setRegistries = (registries: readonly (string | null)[] | undefined) => {
  nameRegistriesResult.data = registries
  nameRegistriesResult.error = undefined
  nameRegistriesResult.isLoading = false
}

// truncateAddress(address, 6, 4) — default separator is the ellipsis char '…'
const truncated = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`

describe('V2RegistryInfo', () => {
  beforeEach(() => {
    setRegistries(undefined)
    mockHasSetSubregistryRole.hasRole = false
    mockHasSetSubregistryRole.error = null
    setSubregistryHistory({})
    ownerHoldsAllBut()
  })

  const configuredLeaf = (subregistry: string) =>
    setRegistries([
      subregistry, // foo.eth's subregistry
      '0x1111111111111111111111111111111111111111', // .eth registry
      '0x0000000000000000000000000000000000000000', // root
    ])

  it('renders the section header', () => {
    setRegistries([
      '0x2222222222222222222222222222222222222222',
      '0x1111111111111111111111111111111111111111',
      '0x0000000000000000000000000000000000000000',
    ])

    render(<V2RegistryInfo name="foo.eth" ownerData={ownerData} />)

    expect(screen.getByRole('heading', { name: /registry/i })).toBeVisible()
  })

  it('omits the configure form for a 2LD with a deployed subregistry', () => {
    const subregistry = '0x2222222222222222222222222222222222222222'
    setRegistries([
      subregistry, // foo.eth's subregistry
      '0x1111111111111111111111111111111111111111', // .eth registry
      '0x0000000000000000000000000000000000000000', // root
    ])

    render(<V2RegistryInfo name="foo.eth" ownerData={ownerData} />)

    // Deepest registry is configured, so the inline configure form is hidden.
    expect(
      screen.queryByTestId('configure-registry-form'),
    ).not.toBeInTheDocument()
    // The deployed subregistry renders as a row.
    expect(screen.getByText(truncated(subregistry))).toBeInTheDocument()
  })

  describe('a subregistry slot that was zeroed, not never set (immunefi #93026)', () => {
    const detachedLeaf = () => {
      setRegistries([
        zeroAddress, // foo.eth's subregistry — detached, not virgin
        '0x1111111111111111111111111111111111111111', // .eth registry
        '0x0000000000000000000000000000000000000000', // root
      ])
      setSubregistryHistory({ data: 1 })
    }

    it('does not offer the configure form on a detached slot', () => {
      detachedLeaf()

      render(<V2RegistryInfo name="foo.eth" ownerData={ownerData} />)

      // Deploying a fresh registry here would let the holder re-mint a
      // victim's label into it and strand the original token.
      expect(
        screen.queryByTestId('configure-registry-form'),
      ).not.toBeInTheDocument()
    })

    it('explains that the name is damaged and points at the repair', () => {
      detachedLeaf()

      render(<V2RegistryInfo name="foo.eth" ownerData={ownerData} />)

      expect(screen.getByText(/registry detached/i)).toBeInTheDocument()
      expect(
        screen.getByText(/point this name back at that registry/i),
      ).toBeInTheDocument()
    })

    it('withholds the configure form while the history lookup is in flight', () => {
      setRegistries([
        zeroAddress,
        '0x1111111111111111111111111111111111111111',
        '0x0000000000000000000000000000000000000000',
      ])
      setSubregistryHistory({ data: undefined })

      render(<V2RegistryInfo name="foo.eth" ownerData={ownerData} />)

      expect(
        screen.queryByTestId('configure-registry-form'),
      ).not.toBeInTheDocument()
    })

    it('treats a missing history count as unknown, not as "never configured"', () => {
      // The indexer declining to count is not a name with no history; reading
      // it as zero would hand back the re-mint surface.
      setRegistries([
        zeroAddress,
        '0x1111111111111111111111111111111111111111',
        '0x0000000000000000000000000000000000000000',
      ])
      setSubregistryHistory({ data: null })

      render(<V2RegistryInfo name="foo.eth" ownerData={ownerData} />)

      expect(
        screen.queryByTestId('configure-registry-form'),
      ).not.toBeInTheDocument()
    })

    it('withholds the configure form when the history lookup fails', () => {
      // Fail closed: "we couldn't check" must never read as "never configured".
      setRegistries([
        zeroAddress,
        '0x1111111111111111111111111111111111111111',
        '0x0000000000000000000000000000000000000000',
      ])
      setSubregistryHistory({ data: undefined, isError: true })

      render(<V2RegistryInfo name="foo.eth" ownerData={ownerData} />)

      expect(
        screen.queryByTestId('configure-registry-form'),
      ).not.toBeInTheDocument()
      expect(
        screen.getByText(/couldn't check this name's registry history/i),
      ).toBeInTheDocument()
    })
  })

  it('shows the configure form for a 2LD without a deployed subregistry', () => {
    setRegistries([
      zeroAddress, // foo.eth's subregistry not yet deployed
      '0x1111111111111111111111111111111111111111', // .eth registry
      '0x0000000000000000000000000000000000000000', // root
    ])

    render(<V2RegistryInfo name="foo.eth" ownerData={ownerData} />)

    const form = screen.getByTestId('configure-registry-form')
    expect(form).toHaveAttribute('data-name', 'foo.eth')
  })

  it('shows the configure form for a 3LD without a subregistry (WEB-249)', () => {
    const parent = '0x2222222222222222222222222222222222222222'
    setRegistries([
      zeroAddress, // 1.foo.eth's subregistry — not yet deployed
      parent, // foo.eth's subregistry (parent)
      '0x1111111111111111111111111111111111111111', // .eth registry
      '0x0000000000000000000000000000000000000000', // root
    ])

    render(<V2RegistryInfo name="1.foo.eth" ownerData={ownerData} />)

    const form = screen.getByTestId('configure-registry-form')
    expect(form).toHaveAttribute('data-name', '1.foo.eth')
    // The parent registry still renders as a row above the form.
    expect(screen.getByText(truncated(parent))).toBeInTheDocument()
  })

  it('renders the 4LD layout for a 5-tuple registries shape', () => {
    const parent = '0x3333333333333333333333333333333333333333'
    setRegistries([
      zeroAddress, // x.1.foo.eth's subregistry — not yet deployed
      parent, // 1.foo.eth's subregistry (parent)
      '0x2222222222222222222222222222222222222222', // foo.eth's subregistry
      '0x1111111111111111111111111111111111111111', // .eth registry
      '0x0000000000000000000000000000000000000000', // root
    ])

    render(<V2RegistryInfo name="x.1.foo.eth" ownerData={ownerData} />)

    const form = screen.getByTestId('configure-registry-form')
    expect(form).toHaveAttribute('data-name', 'x.1.foo.eth')
    expect(screen.getByText(truncated(parent))).toBeInTheDocument()
  })

  // Mirrors on-chain findRegistries(5.4.testing.fresh.eth) on Sepolia.
  it('renders the 5LD layout for a 6-tuple registries shape', () => {
    const parent = '0x1e39685086544eD33b561Fb2aa2B22192F5e3c47'
    setRegistries([
      zeroAddress, // 5.4.testing.fresh.eth — not yet deployed
      parent, // 4.testing.fresh.eth (parent)
      '0x4d337208B153620A9ec54Fb27aeF50743F7d4A50', // testing.fresh.eth
      '0x2f8eBF59b8dEeB06d6a0F0443b5bAd9509620d99', // fresh.eth
      '0x796fFF2E907449be8D5921BCC215B1b76D89d080', // .eth
      '0x3A3E15A5d27fF6F05C844313312f2e72096D3eD3', // root
    ])

    render(
      <V2RegistryInfo name="5.4.testing.fresh.eth" ownerData={ownerData} />,
    )

    const form = screen.getByTestId('configure-registry-form')
    expect(form).toHaveAttribute('data-name', '5.4.testing.fresh.eth')
    expect(screen.getByText(truncated(parent))).toBeInTheDocument()
  })

  it('hides the Reconfigure button on a configured leaf without the role', () => {
    configuredLeaf('0x2222222222222222222222222222222222222222')

    render(<V2RegistryInfo name="foo.eth" ownerData={ownerData} />)

    expect(
      screen.queryByRole('button', { name: /reconfigure/i }),
    ).not.toBeInTheDocument()
  })

  it('shows the Reconfigure button on a configured leaf with ROLE_SET_SUBREGISTRY', () => {
    mockHasSetSubregistryRole.hasRole = true
    configuredLeaf('0x2222222222222222222222222222222222222222')

    render(<V2RegistryInfo name="foo.eth" ownerData={ownerData} />)

    expect(screen.getByRole('button', { name: /reconfigure/i })).toBeVisible()
    // The reconfigure form stays closed until the button is clicked.
    expect(
      screen.queryByTestId('reconfigure-registry-form'),
    ).not.toBeInTheDocument()
  })

  it('opens the reconfigure form when Reconfigure is clicked', () => {
    mockHasSetSubregistryRole.hasRole = true
    configuredLeaf('0x2222222222222222222222222222222222222222')

    render(<V2RegistryInfo name="foo.eth" ownerData={ownerData} />)

    fireEvent.click(screen.getByRole('button', { name: /reconfigure/i }))

    expect(screen.getByTestId('reconfigure-registry-form')).toHaveAttribute(
      'data-name',
      'foo.eth',
    )
  })

  it('surfaces a role-check failure instead of hiding Reconfigure silently', () => {
    mockHasSetSubregistryRole.hasRole = undefined
    mockHasSetSubregistryRole.error = new Error('rpc failed')
    configuredLeaf('0x2222222222222222222222222222222222222222')

    render(<V2RegistryInfo name="foo.eth" ownerData={ownerData} />)

    expect(
      screen.queryByRole('button', { name: /reconfigure/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(/couldn't verify reconfigure permissions/i),
    ).toBeVisible()
  })

  describe('missing subregistry privileges (contracts-v2#432)', () => {
    const unconfiguredLeaf = () =>
      setRegistries([
        zeroAddress,
        '0x1111111111111111111111111111111111111111',
        '0x0000000000000000000000000000000000000000',
      ])

    it('replaces the configure form when nobody can ever set the subregistry', () => {
      ownerHoldsAllBut('ROLE_SET_SUBREGISTRY', 'ROLE_SET_SUBREGISTRY_ADMIN')
      unconfiguredLeaf()

      render(<V2RegistryInfo name="foo.eth" ownerData={ownerData} />)

      expect(screen.getByText('No registry configured')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Subregistry is locked. Missing ROLE_SET_SUBREGISTRY and ROLE_SET_SUBREGISTRY_ADMIN',
      )
      expect(
        screen.queryByTestId('configure-registry-form'),
      ).not.toBeInTheDocument()
    })

    it('keeps the configure form for a connected wallet that can set it anyway', () => {
      // A delegate, or a registry-root holder: the owner's lock doesn't bind them.
      ownerHoldsAllBut('ROLE_SET_SUBREGISTRY', 'ROLE_SET_SUBREGISTRY_ADMIN')
      mockHasSetSubregistryRole.hasRole = true
      unconfiguredLeaf()

      render(<V2RegistryInfo name="foo.eth" ownerData={ownerData} />)

      expect(screen.getByTestId('configure-registry-form')).toBeInTheDocument()
      expect(
        screen.queryByText(/subregistry is locked/i),
      ).not.toBeInTheDocument()
    })

    it('keeps the configure form when the owner can still set it', () => {
      ownerHoldsAllBut('ROLE_SET_SUBREGISTRY_ADMIN')
      unconfiguredLeaf()

      render(<V2RegistryInfo name="foo.eth" ownerData={ownerData} />)

      expect(screen.getByTestId('configure-registry-form')).toBeInTheDocument()
    })

    it('flags a configured subregistry the owner cannot change', () => {
      ownerHoldsAllBut('ROLE_SET_SUBREGISTRY', 'ROLE_SET_SUBREGISTRY_ADMIN')
      configuredLeaf('0x2222222222222222222222222222222222222222')

      render(<V2RegistryInfo name="foo.eth" ownerData={ownerData} />)

      expect(screen.getByText('Subregistry locked')).toBeInTheDocument()
    })

    it('flags nothing when the owner holds the subregistry roles', () => {
      configuredLeaf('0x2222222222222222222222222222222222222222')

      render(<V2RegistryInfo name="foo.eth" ownerData={ownerData} />)

      expect(screen.queryByText('Subregistry locked')).not.toBeInTheDocument()
    })
  })
})
