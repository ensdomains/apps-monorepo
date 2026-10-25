import { fireEvent, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel } from '@/features/notifications/data/queries/channels'
import { useTelegramLogin } from '@/features/notifications/hooks/useTelegramLogin'
import { copyToClipboard } from '@/lib/clipboard'
import { render } from '@/utils/test-utils'
import { TelegramContactMethod } from './telegram'

vi.mock('@/features/notifications/hooks/useTelegramLogin', () => ({
  useTelegramLogin: vi.fn(),
}))
vi.mock('@/lib/clipboard', () => ({ copyToClipboard: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const login = {
  openingStrategy: 'new-tab',
  attempt: null,
  isPending: false,
  isExpired: false,
  isStarting: false,
  isCancelling: false,
  startError: null,
  cancelError: null,
  statusError: null,
  authorizationUrl: undefined,
  connect: vi.fn(),
  cancel: vi.fn(),
} satisfies ReturnType<typeof useTelegramLogin>

const channel = {
  id: 'telegram-channel',
  channel: 'telegram',
  status: 'verified',
  label: 'Telegram account without a username',
} as Channel

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useTelegramLogin).mockReturnValue(login)
})

describe('Telegram contact method', () => {
  it('connects without submitting a surrounding registration form', () => {
    const onSubmit = vi.fn((event) => event.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <TelegramContactMethod />
      </form>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Connect Telegram' }))
    expect(login.connect).toHaveBeenCalledOnce()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('offers a safe new-tab link and cancellation while waiting', () => {
    vi.mocked(useTelegramLogin).mockReturnValue({
      ...login,
      isPending: true,
      authorizationUrl: 'https://oauth.telegram.org/auth?state=test',
    })
    render(<TelegramContactMethod />)
    expect(screen.getByText('Waiting for Telegram')).toBeVisible()
    const link = screen.getByRole('link', { name: 'Continue to Telegram' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(
      screen.queryByRole('button', { name: 'Connect Telegram' }),
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel connection' }))
    expect(login.cancel).toHaveBeenCalledOnce()
  })

  it('keeps cancellation available after remounting without an authorization URL', () => {
    vi.mocked(useTelegramLogin).mockReturnValue({ ...login, isPending: true })
    render(<TelegramContactMethod />)
    expect(
      screen.queryByRole('link', { name: 'Continue to Telegram' }),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Cancel connection' }),
    ).toBeEnabled()
  })

  it('offers Safari handoff instructions without a new-window target on iOS MetaMask', () => {
    vi.mocked(useTelegramLogin).mockReturnValue({
      ...login,
      openingStrategy: 'safari',
      isPending: true,
      authorizationUrl: 'https://oauth.telegram.org/auth?state=test',
    })
    render(<TelegramContactMethod />)
    const link = screen.getByRole('link', { name: 'Open in Safari' })
    expect(link).toHaveAttribute(
      'href',
      'x-safari-https://oauth.telegram.org/auth?state=test',
    )
    expect(link).not.toHaveAttribute('target')
    expect(screen.getByText(/Keep ENS Manager open in MetaMask/)).toBeVisible()
  })

  it.each([false, true])(
    'copies the HTTPS sign-in link and reports clipboard failure: %s',
    async (hasError) => {
      const url = 'https://oauth.telegram.org/auth?state=test'
      vi.mocked(useTelegramLogin).mockReturnValue({
        ...login,
        openingStrategy: 'safari',
        isPending: true,
        authorizationUrl: url,
      })
      vi.mocked(copyToClipboard).mockImplementationOnce(() =>
        hasError ? Promise.reject(new Error('denied')) : Promise.resolve(),
      )
      render(<TelegramContactMethod />)
      fireEvent.click(screen.getByRole('button', { name: 'Copy sign-in link' }))
      await waitFor(() =>
        expect(hasError ? toast.error : toast.success).toHaveBeenCalledOnce(),
      )
      expect(copyToClipboard).toHaveBeenCalledWith(url)
    },
  )

  it('shows the linked account and confirms removal', () => {
    render(<TelegramContactMethod telegram={channel} />)
    expect(screen.getByText(channel.label)).toBeVisible()
    expect(screen.getByText('Connected')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Reconnect Telegram' }),
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Telegram' }))
    expect(screen.getByRole('alertdialog')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByText(channel.label)).toBeVisible()
  })

  it('offers reconnection for a disabled channel', () => {
    render(
      <TelegramContactMethod telegram={{ ...channel, status: 'disabled' }} />,
    )
    expect(screen.getByText('Bot access needed')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect Telegram' }))
    expect(login.connect).toHaveBeenCalledOnce()
  })

  it('allows another attempt after expiry', () => {
    vi.mocked(useTelegramLogin).mockReturnValue({ ...login, isExpired: true })
    render(<TelegramContactMethod />)
    expect(
      screen.getByText('Telegram login expired. Please try again.'),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Connect Telegram' }),
    ).toBeEnabled()
  })
})
