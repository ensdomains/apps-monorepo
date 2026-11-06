import type { Row } from '@tanstack/react-table'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AddressResolutionRow } from './types'

const OWNER = '0x1111111111111111111111111111111111111111' as Address
const VISITOR = '0x2222222222222222222222222222222222222222' as Address
const RESOLVER = '0x4444444444444444444444444444444444444444' as Address

let connectedAddress: Address = OWNER
let isOwner = true
let canEdit = false

vi.mock('wagmi', () => ({
  useConnection: () => ({ address: connectedAddress, isConnected: true }),
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/features/records/hooks/useCanEditRecords', () => ({
  useCanEditRecords: () => ({
    canEdit,
    isLoading: false,
    isOwner: false,
    resolverAddress: undefined,
  }),
}))
// The ownership rule itself is covered in useIsNameOwner.test.ts.
vi.mock('@/features/ownership/hooks/useIsNameOwner', () => ({
  useIsNameOwner: () => ({ isOwner, isLoading: false }),
}))
vi.mock('@/features/records/hooks/useSaveRecords', () => ({
  useSaveRecords: () => ({
    saveRecords: vi.fn(),
    isWriting: false,
    isConfirming: false,
    isSyncing: false,
    isWrongChain: false,
    isSwitchingChain: false,
    switchToRequiredNetwork: vi.fn(),
  }),
}))
vi.mock('@/features/reverse-resolution/hooks/useSetReverseResolution', () => ({
  useSetReverseResolution: () => ({ setReverseResolution: vi.fn() }),
}))
vi.mock('@/features/reverse-resolution/hooks/useSetL2ReverseName', () => ({
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
vi.mock('@/components/CopyableRecord', () => ({
  CopyableRecord: ({ displayValue }: { displayValue: React.ReactNode }) => (
    <span>{displayValue}</span>
  ),
}))
vi.mock('@/features/history/components/HistoryTimeline', () => ({
  HistoryTimeline: () => null,
}))
vi.mock('@/features/profile/components/NameAvatar', () => ({
  NameAvatar: () => null,
}))
vi.mock('@/lib/wagmi', () => ({ ensChain: { id: 11155111 } }))
vi.mock('@ens-apps/l2-primary/v1', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ens-apps/l2-primary/v1')>()),
  getRegistrarAddress: () => '0x3333333333333333333333333333333333333333',
}))

const { AddressResolutionSidebar } = await import('./AddressResolutionSidebar')

// The name's `addr(60)` record — its owner points it wherever they like, so on
// a visitor's screen it is attacker-controlled.
const mainnetRow = (address: Address): Row<AddressResolutionRow> =>
  ({
    original: {
      coinType: 60,
      label: 'Mainnet',
      icon: '',
      address,
      reverseMatch: 'mismatch',
      reverseName: null,
      reverseError: null,
    },
  }) as Row<AddressResolutionRow>

const renderSidebar = (
  row: Row<AddressResolutionRow>,
  resolverAddress?: Address,
) =>
  render(
    <AddressResolutionSidebar
      row={row}
      name="attacker.eth"
      resolverAddress={resolverAddress}
      open
      setOpen={vi.fn()}
    />,
  )

describe('AddressResolutionSidebar', () => {
  beforeEach(() => {
    connectedAddress = OWNER
    isOwner = true
    canEdit = false
  })

  it('offers "Set primary name" to the owner when the row points at their wallet', () => {
    renderSidebar(mainnetRow(OWNER))

    expect(
      screen.getByRole('button', { name: 'Set primary name' }),
    ).toBeInTheDocument()
  })

  it('shows the mismatch banner but no action to a visitor the record points at', () => {
    connectedAddress = VISITOR
    isOwner = false

    renderSidebar(mainnetRow(VISITOR))

    expect(
      screen.getByText(
        'The set address does not resolve back to this name on Mainnet',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Set primary name' }),
    ).not.toBeInTheDocument()
  })

  describe('editing the address', () => {
    const typeAddress = (value: string) => {
      canEdit = true
      renderSidebar(mainnetRow(OWNER), RESOLVER)
      fireEvent.change(screen.getByPlaceholderText('0x…'), {
        target: { value },
      })
    }

    it('blocks Save and says why when the address is not valid for the network', () => {
      typeAddress('bob')

      expect(screen.getByPlaceholderText('0x…')).toHaveAttribute(
        'aria-invalid',
        'true',
      )
      expect(screen.getByText(/^Invalid MAINNET address/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    })

    it('keeps Save available for a valid address, a contract included', () => {
      typeAddress('0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2')

      expect(screen.getByPlaceholderText('0x…')).not.toHaveAttribute(
        'aria-invalid',
        'true',
      )
      expect(
        screen.queryByText(/^Invalid MAINNET address/),
      ).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    })
  })
})
