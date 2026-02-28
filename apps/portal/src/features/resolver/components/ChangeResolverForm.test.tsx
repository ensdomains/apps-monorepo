import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChangeResolverForm } from './ChangeResolverForm'

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
}))

vi.mock('wagmi', () => ({
  useConnection: () => ({
    address: '0x1234567890123456789012345678901234567890',
  }),
}))

const mockChangeResolverAsync = vi.fn()
vi.mock('@/features/resolver/hooks/useChangeResolver', () => ({
  useChangeResolver: (_params: { name: string; registryAddress: string }) => {
    return {
      changeResolverAsync: mockChangeResolverAsync,
      txHash: undefined,
      isWriting: false,
      isConfirming: false,
      isConfirmed: false,
      isReverted: false,
      error: null,
    }
  },
}))

const mockDeployDedicatedResolverAsync = vi.fn()
vi.mock('@/features/resolver/hooks/useDeployDedicatedResolver', () => ({
  useDeployDedicatedResolver: (_params: { name: string }) => ({
    deployDedicatedResolverAsync: mockDeployDedicatedResolverAsync,
    txHash: undefined,
    deployedResolverAddress: undefined,
    isWriting: false,
    isConfirming: false,
    isConfirmed: false,
    error: null,
    hasWallet: true,
  }),
}))

vi.mock('@/features/resolver/hooks/useUserDedicatedResolvers', () => ({
  useUserDedicatedResolvers: (_params: { senderAddress?: string }) => ({
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
  const registryAddress = '0x1234567890123456789012345678901234567890'

  beforeEach(() => {
    mockChangeResolverAsync.mockReset()
    mockDeployDedicatedResolverAsync.mockReset()
  })

  it('renders default custom resolver mode', () => {
    render(
      <ChangeResolverForm
        name={name}
        registryAddress={registryAddress as `0x${string}`}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Change resolver' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: /Use custom resolver/i }),
    ).toBeChecked()
    expect(screen.getByLabelText(/Contract address/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save changes/i })).toBeDisabled()
  })

  it('calls changeResolverAsync when valid custom resolver is submitted', async () => {
    const user = userEvent.setup()
    mockChangeResolverAsync.mockResolvedValue(undefined)

    render(
      <ChangeResolverForm
        name={name}
        registryAddress={registryAddress as `0x${string}`}
      />,
    )

    await user.type(
      screen.getByPlaceholderText('0x...'),
      '0xabcdef123456789012345678901234567890abcd',
    )
    await user.click(screen.getByRole('button', { name: /Save changes/i }))

    expect(mockChangeResolverAsync).toHaveBeenCalledTimes(1)
    expect(mockChangeResolverAsync).toHaveBeenCalledWith(
      '0xabcdef123456789012345678901234567890abcd',
    )
  })

  it('deploys a resolver then sets it when non-custom + deploy is enabled', async () => {
    const user = userEvent.setup()
    mockDeployDedicatedResolverAsync.mockResolvedValue({
      resolverAddress: '0x9999999999999999999999999999999999999999',
    })
    mockChangeResolverAsync.mockResolvedValue(undefined)

    render(
      <ChangeResolverForm
        name={name}
        registryAddress={registryAddress as `0x${string}`}
      />,
    )

    await user.click(
      screen.getByRole('switch', { name: /Use custom resolver/i }),
    )
    await user.click(screen.getByRole('button', { name: /Save changes/i }))

    expect(mockDeployDedicatedResolverAsync).toHaveBeenCalledTimes(1)
    expect(mockChangeResolverAsync).toHaveBeenCalledWith(
      '0x9999999999999999999999999999999999999999',
    )
  })

  it('uses selected existing resolver when non-custom + deploy disabled', async () => {
    const user = userEvent.setup()
    mockChangeResolverAsync.mockResolvedValue(undefined)

    render(
      <ChangeResolverForm
        name={name}
        registryAddress={registryAddress as `0x${string}`}
      />,
    )

    await user.click(
      screen.getByRole('switch', { name: /Use custom resolver/i }),
    )
    await user.click(
      screen.getByRole('switch', { name: /Deploy new dedicated resolver/i }),
    )
    await user.selectOptions(
      screen.getByLabelText(/Existing dedicated resolver/i),
      '0x1234512345123451234512345123451234512345',
    )
    await user.click(screen.getByRole('button', { name: /Save changes/i }))

    expect(mockDeployDedicatedResolverAsync).not.toHaveBeenCalled()
    expect(mockChangeResolverAsync).toHaveBeenCalledWith(
      '0x1234512345123451234512345123451234512345',
    )
  })
})
