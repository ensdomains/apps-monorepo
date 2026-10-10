import type { Row } from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAINNET_COIN_TYPE } from '@/lib/coinType'
import type { ReverseResolutionResult } from '../../hooks/useReverseResolution'

const OWNER = '0x1111111111111111111111111111111111111111' as Address
const VISITOR = '0x2222222222222222222222222222222222222222' as Address

let connectedAddress: Address = OWNER
/** Whether the connected wallet owns the name in the row, not the address. */
let isNameOwner = true

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
  useQuery: () => ({ data: undefined, isLoading: false, isPending: false }),
}))
// The ownership rule itself is covered in useIsNameOwner.test.ts.
vi.mock('@/features/ownership/hooks/useIsNameOwner', () => ({
  useIsNameOwner: () => ({ isOwner: isNameOwner, isLoading: false }),
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
    isNameOwner = true
  })

  // Closing the mismatch is a `setAddr` on the *name's* resolver, so it needs
  // authority over the name — which address equality alone never established.
  it('disables "Set primary name" when the wallet does not own the name, and says why', () => {
    isNameOwner = false

    renderSidebar(OWNER)

    expect(setPrimaryButton()).toBeDisabled()
    expect(
      screen.getByText(
        /Only the owner of someone-elses\.eth can point it back at this address/,
      ),
    ).toBeInTheDocument()
  })

  // Pointing your own address at a name you don't own is a legal `setName`
  // producing an unverified record. Gating the forward write must not take the
  // reverse write away.
  it('still lets a non-owner edit the reverse name for their own address', () => {
    isNameOwner = false

    renderSidebar(OWNER)

    expect(reverseNameInput()).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument()
  })

  it('offers "Set primary name" to the owner of the name', () => {
    renderSidebar(OWNER)

    expect(setPrimaryButton()).toBeEnabled()
    expect(screen.queryByText(/Only the owner of/)).not.toBeInTheDocument()
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

  it('offers a visitor nothing even when they own the name', () => {
    connectedAddress = VISITOR
    isNameOwner = true

    renderSidebar(OWNER)

    // `setAddr` must target the signer; this row is a different address.
    expect(setPrimaryButton()).not.toBeInTheDocument()
  })
})
