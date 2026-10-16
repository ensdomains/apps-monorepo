import type { Row } from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAINNET_COIN_TYPE } from '@/lib/coinType'
import type { ReverseResolutionResult } from '../../hooks/useReverseResolution'

const OWNER = '0x1111111111111111111111111111111111111111' as Address
const VISITOR = '0x2222222222222222222222222222222222222222' as Address

let connectedAddress: Address = OWNER
/** Whether the connected wallet can set the row name's address record. */
let canSetAddress = true
let isNameAuthorityError = false
let canEditParams: unknown

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
vi.mock('@/features/history/components/HistoryTimeline', () => ({
  HistoryTimeline: () => null,
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

  it('offers a visitor nothing even when they can set the address', () => {
    connectedAddress = VISITOR
    canSetAddress = true

    renderSidebar(OWNER)

    // `setAddr` must target the signer; this row is a different address.
    expect(setPrimaryButton()).not.toBeInTheDocument()
  })
})
