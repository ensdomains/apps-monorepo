import type { Row } from '@tanstack/react-table'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { okAsync } from 'neverthrow'
import { toast } from 'sonner'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NameResolver } from '@/features/records/hooks/useNameResolverAddress'
import { MAINNET_COIN_TYPE } from '@/lib/coinType'
import type { ReverseResolutionResult } from '../../hooks/useReverseResolution'

const OWNER = '0x1111111111111111111111111111111111111111' as Address
const VISITOR = '0x2222222222222222222222222222222222222222' as Address
const RESOLVER = '0x3333333333333333333333333333333333333333' as Address
const UNREACHABLE: NameResolver = { address: RESOLVER, source: 'v1-registry' }

let connectedAddress: Address = OWNER
/** Whether the connected wallet can set the row name's address record. */
let canSetAddress = true
let isNameAuthorityError = false
let canEditParams: unknown
/** The row name's resolver read, which says whether lookups reach it. */
let nameResolverQuery: { status: string; data: NameResolver | undefined }
/** The resolver read for a name typed into the reverse-name field. */
let typedNameResolver: NameResolver | null

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConnection: () => ({
    address: connectedAddress,
    isConnected: true,
    chain: undefined,
  }),
  useWalletClient: () => ({ data: undefined }),
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) =>
    queryKey[0] === 'get-name-resolver-address'
      ? nameResolverQuery
      : { data: undefined, isLoading: false, isPending: false },
}))
vi.mock(
  '@/features/records/hooks/useNameResolverAddress',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/features/records/hooks/useNameResolverAddress')
    >()),
    getNameResolver: () => okAsync(typedNameResolver),
  }),
)
vi.mock('@/features/profile/hooks/useEnsOwner', () => ({
  getEnsOwner: () => okAsync({ owner: OWNER }),
}))
vi.mock('sonner', () => ({
  toast: { warning: vi.fn(), error: vi.fn(), loading: vi.fn() },
}))
// The permission rule itself is covered in useCanEditRecords.test.ts.
vi.mock('@/features/records/hooks/useCanEditRecords', () => ({
  useCanEditRecords: (params: unknown) => {
    canEditParams = params
    return {
      canEdit: canSetAddress,
      isLoading: false,
      isError: isNameAuthorityError,
    }
  },
}))
vi.mock('./hooks/useReverseResolutionMutations', () => ({
  useReverseResolutionMutations: () => ({
    getReverseResolutionRequest: vi.fn(),
    getForwardResolutionRequest: vi.fn(),
    invalidateReverseResolutionQuery: vi.fn(),
    isEnsOwnerLoading: false,
    isResolverKindLoading: false,
  }),
}))
vi.mock('./hooks/useSwitchToRequiredNetwork', () => ({
  useSwitchToRequiredNetwork: () => ({
    isWrongChain: false,
    isSwitchingChain: false,
    requiredChainId: 11155111,
    switchChainAsync: vi.fn(),
    getSwitchToRequiredNetworkRequest: vi.fn(),
  }),
}))
vi.mock('../../hooks/useSetReverseResolution', () => ({
  useSetReverseResolution: () => ({
    setReverseResolution: vi.fn(),
    isPending: false,
  }),
}))
vi.mock('../../hooks/useSetForwardResolution', () => ({
  useSetForwardResolution: () => ({
    setForwardResolution: vi.fn(),
    isPending: false,
  }),
}))
vi.mock('../../hooks/useSetL2ReverseName', () => ({
  useSetL2ReverseName: () => ({
    setL2ReverseNameAsync: vi.fn(),
    isPending: false,
  }),
}))
vi.mock('@/features/transaction-manager/hooks/useTransactionModal', () => ({
  useTransactionModal: () => ({
    openModal: vi.fn(),
    closeModal: vi.fn(),
    clearTransaction: vi.fn(),
  }),
}))
vi.mock('@/features/transaction-manager/components/TransactionModal', () => ({
  TransactionModal: () => null,
}))
vi.mock('@/components/EntityBadge', () => ({
  EntityBadge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}))
vi.mock('@/components/table/EventsDataTable', () => ({
  EventsDataTable: () => null,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="/">{children}</a>
  ),
}))

const { ReverseResolutionSidebar } = await import('./ReverseResolutionSidebar')

/**
 * A Mainnet row whose reverse name is set but whose forward `addr` does not
 * point back — the mismatch the "Set primary name" action exists to close.
 */
const mismatchedRow = (): Row<ReverseResolutionResult> =>
  ({
    original: {
      coinType: MAINNET_COIN_TYPE,
      reverseRegistrarChainId: 60,
      label: 'Mainnet',
      icon: '',
      name: 'someone-elses.eth',
      reverseResolverAddress: null,
      resolverAddress: null,
      normalized: true,
      forwardMatch: false,
      defaultName: null,
      defaultForwardMatch: false,
    },
  }) as Row<ReverseResolutionResult>

const renderSidebar = (address: Address) =>
  render(
    <ReverseResolutionSidebar
      row={mismatchedRow()}
      address={address}
      open
      setOpen={vi.fn()}
    />,
  )

const setPrimaryButton = () =>
  screen.queryByRole('button', { name: 'Set primary name' })
const reverseNameInput = () =>
  document.querySelector<HTMLInputElement>('input[name="name"]')

describe('ReverseResolutionSidebar', () => {
  beforeEach(() => {
    connectedAddress = OWNER
    canSetAddress = true
    isNameAuthorityError = false
    canEditParams = undefined
    nameResolverQuery = {
      status: 'success',
      data: { address: RESOLVER, source: 'lookup' },
    }
    typedNameResolver = null
    vi.clearAllMocks()
  })

  // Closing the mismatch is a `setAddr` on the *name's* resolver, so it needs
  // `ROLE_SET_ADDRESS` there, not just ownership of the name.
  it('asks for ROLE_SET_ADDRESS scoped to the row coin type', () => {
    renderSidebar(OWNER)

    expect(canEditParams).toEqual({
      name: 'someone-elses.eth',
      roles: ['ROLE_SET_ADDRESS'],
      scope: { kind: 'address', coinType: BigInt(MAINNET_COIN_TYPE) },
    })
  })

  it('disables "Set primary name" when the wallet cannot set the address, and says why', () => {
    canSetAddress = false

    renderSidebar(OWNER)

    expect(setPrimaryButton()).toBeDisabled()
    expect(
      screen.getByText(
        /Only an account that can edit someone-elses\.eth's address records can point it back/,
      ),
    ).toBeInTheDocument()
  })

  it('disables "Set primary name" when the permission read fails, without claiming a refusal', () => {
    canSetAddress = false
    isNameAuthorityError = true

    renderSidebar(OWNER)

    expect(setPrimaryButton()).toBeDisabled()
    expect(screen.getByText(/We couldn't check/)).toBeInTheDocument()
    expect(screen.queryByText(/Only an account/)).not.toBeInTheDocument()
  })

  // Pointing your own address at a name you don't own is a legal `setName`
  // producing an unverified record. Gating the forward write must not take the
  // reverse write away.
  it('still lets a wallet without the role edit the reverse name for their own address', () => {
    canSetAddress = false

    renderSidebar(OWNER)

    expect(reverseNameInput()).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument()
  })

  it('offers "Set primary name" to a wallet that can set the address', () => {
    renderSidebar(OWNER)

    expect(setPrimaryButton()).toBeEnabled()
    expect(screen.queryByText(/Only an account/)).not.toBeInTheDocument()
    // The plain mismatch wording, with no ownership aside.
    expect(
      screen.getByText(
        'The set address does not resolve back to this name on Mainnet',
      ),
    ).toBeInTheDocument()
  })

  it('offers a visitor nothing on someone else’s address', () => {
    connectedAddress = VISITOR

    renderSidebar(OWNER)

    expect(setPrimaryButton()).not.toBeInTheDocument()
    expect(reverseNameInput()).toBeDisabled()
  })

  // WEB-2017: an ENSv1 name under an expired parent keeps a resolver its owner
  // can write, but lookups don't reach it, so the `setAddr` changes nothing.
  it('disables "Set primary name" for a name lookups no longer reach, and says why', () => {
    nameResolverQuery = { status: 'success', data: UNREACHABLE }

    renderSidebar(OWNER)

    expect(setPrimaryButton()).toBeDisabled()
    expect(
      screen.getByText(
        'The set address does not resolve back to this name on Mainnet. someone-elses.eth no longer resolves, usually because it or its parent name has expired.',
      ),
    ).toBeInTheDocument()
  })

  it('gives a visitor the same reason for an unreachable reverse name', () => {
    connectedAddress = VISITOR
    nameResolverQuery = { status: 'success', data: UNREACHABLE }

    renderSidebar(OWNER)

    expect(
      screen.getByText(/someone-elses\.eth no longer resolves/),
    ).toBeInTheDocument()
  })

  it('disables "Set primary name" when the reach read fails, without claiming the name is unreachable', () => {
    nameResolverQuery = { status: 'error', data: undefined }

    renderSidebar(OWNER)

    expect(setPrimaryButton()).toBeDisabled()
    expect(screen.getByText(/We couldn't check/)).toBeInTheDocument()
    expect(screen.queryByText(/no longer resolves/)).not.toBeInTheDocument()
  })

  it('warns when the reverse name entered is one lookups no longer reach', async () => {
    typedNameResolver = UNREACHABLE

    renderSidebar(OWNER)
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'kid.lapsed.eth' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))

    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(
        "kid.lapsed.eth no longer resolves, usually because it or its parent name has expired — it won't work as your primary name until it resolves again.",
      ),
    )
  })

  it('offers a visitor nothing even when they can set the address', () => {
    connectedAddress = VISITOR
    canSetAddress = true

    renderSidebar(OWNER)

    // `setAddr` must target the signer; this row is a different address.
    expect(setPrimaryButton()).not.toBeInTheDocument()
  })
})
