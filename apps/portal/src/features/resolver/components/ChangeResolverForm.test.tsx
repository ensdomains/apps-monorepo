import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChangeResolverForm } from './ChangeResolverForm'

// Captures the transaction descriptors so the tests can drive the lifecycle
// callbacks (`onStart` / `onDone`) the real modal would fire.
type CapturedTransaction = {
  id: string
  onStart?: () => void | Promise<void>
  onDone?: () => void
}

const transactionsRef: { current: CapturedTransaction[] } = { current: [] }

const transactionById = (id: string) =>
  transactionsRef.current.find((transaction) => transaction.id === id)

vi.mock('@/features/transaction-manager/components/TransactionModal', () => ({
  TransactionModal: ({
    transactions,
  }: {
    transactions: CapturedTransaction[]
  }) => {
    transactionsRef.current = transactions
    return null
  },
}))

const mockOpenModal = vi.fn()
vi.mock('@/features/transaction-manager/hooks/useTransactionModal', () => ({
  useTransactionModal: () => ({
    isOpen: false,
    openModal: mockOpenModal,
    closeModal: vi.fn(),
    clearTransaction: vi.fn(),
  }),
}))

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
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
}))

// Partial: the setResolver intent builders reach `@/lib/wagmi`, whose module
// scope calls `createConfig`, so the real exports have to stay available.
vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConnection: () => ({
    address: '0x1234567890123456789012345678901234567890',
  }),
  useChainId: () => 11155111,
  useConfig: () => ({
    chains: [
      {
        id: 11155111,
        blockExplorers: {
          default: { url: 'https://sepolia.etherscan.io' },
        },
      },
    ],
  }),
}))

const mockChangeResolver = vi.fn()
const changeResolverHookState = {
  isPending: false,
  hasWallet: true,
}

vi.mock('@/features/resolver/hooks/useChangeResolver', () => ({
  useChangeResolver: (_params: {
    name: string
    registryAddress: string
    id?: string
  }) => ({
    changeResolver: mockChangeResolver,
    changeResolverAsync: vi.fn(),
    isPending: changeResolverHookState.isPending,
    isSuccess: false,
    isError: false,
    error: null,
    data: undefined,
    reset: vi.fn(),
    hasWallet: changeResolverHookState.hasWallet,
  }),
}))

const mockDeployPermissionedResolverAsync = vi.fn()
vi.mock('@/features/resolver/hooks/useDeployPermissionedResolver', () => ({
  useDeployPermissionedResolver: (_params: { name: string }) => ({
    deployPermissionedResolver: vi.fn(),
    deployPermissionedResolverAsync: mockDeployPermissionedResolverAsync,
    txHash: undefined,
    deployedResolverAddress: undefined,
    isWriting: false,
    isConfirming: false,
    isConfirmed: false,
    error: null,
    reset: vi.fn(),
    hasWallet: true,
  }),
}))

vi.mock('@/features/resolver/hooks/useUserPermissionedResolvers', () => ({
  useUserPermissionedResolvers: (_params: { senderAddress?: string }) => ({
    data: [
      '0xabcdef123456789012345678901234567890abcd',
      '0x1234512345123451234512345123451234512345',
    ],
    isLoading: false,
    error: null,
  }),
}))

describe('ChangeResolverForm', () => {
  const name = 'myname.eth'
  const target = {
    protocol: 'ENSv2',
    registryAddress: '0x1234567890123456789012345678901234567890' as Address,
  } as const

  beforeEach(() => {
    mockChangeResolver.mockReset()
    mockDeployPermissionedResolverAsync.mockReset()
    mockOpenModal.mockReset()
    mockNavigate.mockReset()
    transactionsRef.current = []
    changeResolverHookState.isPending = false
    changeResolverHookState.hasWallet = true
  })

  it('renders default custom resolver mode', () => {
    render(<ChangeResolverForm name={name} target={target} />)

    expect(
      screen.getByRole('heading', { name: `${name} Change resolver` }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: /Use custom resolver/i }),
    ).toBeChecked()
    expect(screen.getByLabelText(/Contract address/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save changes/i })).toBeDisabled()
  })

  it('opens transaction modal when valid custom resolver is submitted', async () => {
    const user = userEvent.setup()

    render(<ChangeResolverForm name={name} target={target} />)

    await user.type(
      screen.getByPlaceholderText('0x...'),
      '0xabcdef123456789012345678901234567890abcd',
    )
    await user.click(screen.getByRole('button', { name: /Save changes/i }))

    expect(mockOpenModal).toHaveBeenCalledTimes(1)
  })

  it('opens transaction modal when non-custom + deploy is enabled', async () => {
    const user = userEvent.setup()

    render(<ChangeResolverForm name={name} target={target} />)

    await user.click(
      screen.getByRole('switch', { name: /Use custom resolver/i }),
    )
    await user.click(screen.getByRole('button', { name: /Save changes/i }))

    expect(mockOpenModal).toHaveBeenCalledTimes(1)
  })

  it('opens transaction modal when using existing resolver', async () => {
    const user = userEvent.setup()

    render(<ChangeResolverForm name={name} target={target} />)

    await user.click(
      screen.getByRole('switch', { name: /Use custom resolver/i }),
    )
    await user.click(
      screen.getByRole('switch', { name: /Deploy new permissioned resolver/i }),
    )
    await user.selectOptions(
      screen.getByLabelText(/Existing permissioned resolver/i),
      '0x1234512345123451234512345123451234512345',
    )
    await user.click(screen.getByRole('button', { name: /Save changes/i }))

    expect(mockOpenModal).toHaveBeenCalledTimes(1)
  })

  it('shows pending button text when change resolver is pending', () => {
    changeResolverHookState.isPending = true

    render(<ChangeResolverForm name={name} target={target} />)

    expect(
      screen.getByRole('button', { name: /Changing resolver.../i }),
    ).toBeInTheDocument()
  })

  // Staying on the form left no sign the change landed, so users saved twice.
  it('navigates to the resolver page once the change transaction is done', async () => {
    const user = userEvent.setup()
    render(<ChangeResolverForm name={name} target={target} />)

    await user.type(
      screen.getByPlaceholderText('0x...'),
      '0xabcdef123456789012345678901234567890abcd',
    )

    const changeTransaction = transactionById('tx-change-resolver')
    expect(changeTransaction).toBeDefined()

    changeTransaction?.onStart?.()
    expect(mockChangeResolver).toHaveBeenCalledWith(
      '0xabcdef123456789012345678901234567890abcd',
    )

    changeTransaction?.onDone?.()

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/$name/resolver',
      params: { name },
    })
  })

  // The deploy path is two transactions: the resolver is deployed first, then
  // the change runs against the address it returned. Drive both so a break in
  // the hand-off can't pass.
  it('navigates to the resolver page after the deploy-then-change flow', async () => {
    const deployedResolver = '0x9999999999999999999999999999999999999999'
    mockDeployPermissionedResolverAsync.mockResolvedValue({
      resolverAddress: deployedResolver,
    })

    const user = userEvent.setup()
    render(<ChangeResolverForm name={name} target={target} />)

    await user.click(
      screen.getByRole('switch', { name: /Use custom resolver/i }),
    )

    const deployTransaction = transactionById('tx-deploy-permissioned-resolver')
    const changeTransaction = transactionById('tx-change-resolver')
    expect(deployTransaction).toBeDefined()
    expect(changeTransaction).toBeDefined()

    await deployTransaction?.onStart?.()
    expect(mockDeployPermissionedResolverAsync).toHaveBeenCalled()

    // The deploy step's own `onDone` kicks off the change against the freshly
    // deployed address.
    deployTransaction?.onDone?.()
    expect(mockChangeResolver).toHaveBeenCalledWith(deployedResolver)

    changeTransaction?.onDone?.()

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/$name/resolver',
      params: { name },
    })
  })
})
