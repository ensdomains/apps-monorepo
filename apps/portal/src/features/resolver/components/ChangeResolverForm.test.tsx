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

describe('ChangeResolverForm', () => {
  const name = 'myname.eth'
  const registryAddress = '0x1234567890123456789012345678901234567890'

  beforeEach(() => {
    mockChangeResolverAsync.mockReset()
  })

  it('renders title, input, and submit button', () => {
    render(
      <ChangeResolverForm
        name={name}
        registryAddress={registryAddress as `0x${string}`}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Change resolver' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/Contract address/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Change resolver' }),
    ).toBeInTheDocument()
  })

  it('disables submit when input is empty', () => {
    render(
      <ChangeResolverForm
        name={name}
        registryAddress={registryAddress as `0x${string}`}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Change resolver' }),
    ).toBeDisabled()
  })

  it('disables submit when input is not a valid address', async () => {
    const user = userEvent.setup()
    render(
      <ChangeResolverForm
        name={name}
        registryAddress={registryAddress as `0x${string}`}
      />,
    )
    await user.type(screen.getByPlaceholderText('0x...'), 'not-an-address')
    expect(
      screen.getByRole('button', { name: 'Change resolver' }),
    ).toBeDisabled()
  })

  it('calls changeResolverAsync when valid address is entered and submit clicked', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Change resolver' }))

    expect(mockChangeResolverAsync).toHaveBeenCalledTimes(1)
    expect(mockChangeResolverAsync).toHaveBeenCalledWith(
      '0xabcdef123456789012345678901234567890abcd',
    )
  })

  it('does not call changeResolverAsync when address is invalid', async () => {
    const user = userEvent.setup()
    render(
      <ChangeResolverForm
        name={name}
        registryAddress={registryAddress as `0x${string}`}
      />,
    )
    await user.type(screen.getByPlaceholderText('0x...'), '0xshort')
    await user.click(screen.getByRole('button', { name: 'Change resolver' }))

    expect(mockChangeResolverAsync).not.toHaveBeenCalled()
  })
})
