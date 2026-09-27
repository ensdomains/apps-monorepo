import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Channel } from '@/features/notifications/data/queries/channels'
import { render } from '@/utils/test-utils'
import { ContactMethods } from './index'

const fixtures = vi.hoisted(() => ({ channels: [] as Channel[] }))

vi.mock(
  '@/features/notifications/data/queries/channels',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/features/notifications/data/queries/channels')
    >()),
    channelsQueryOptions: {
      queryKey: ['channels', 'list'],
      queryFn: async () => fixtures.channels,
    },
  }),
)

vi.mock('./telegram', () => ({ TelegramContactMethod: () => null }))
vi.mock('./push', () => ({ PushContactMethod: () => null }))

describe('Notification Settings email contact method', () => {
  it('offers Add Email when there is no email', async () => {
    fixtures.channels = []
    render(<ContactMethods />)

    expect(await screen.findByPlaceholderText('Enter your email')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Send Verification' }),
    ).toBeVisible()
  })

  it('shows a pending challenge without another add form', async () => {
    fixtures.channels = [
      {
        id: 'challenge-id',
        channel: 'email',
        label: 'pending@example.com',
        status: 'pending',
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        last_verification_sent_at: new Date().toISOString(),
      },
    ] as Channel[]

    render(<ContactMethods />)

    expect(await screen.findByText('pending@example.com')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Verify Email' })).toBeVisible()
    expect(screen.queryByPlaceholderText('Enter your email')).toBeNull()
  })

  it('shows an established email without another add form', async () => {
    fixtures.channels = [
      {
        id: 'verified-id',
        channel: 'email',
        label: 'verified@example.com',
        status: 'verified',
      },
    ] as Channel[]

    render(<ContactMethods />)

    expect(await screen.findByText('verified@example.com')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Email options' })).toBeVisible()
    expect(screen.queryByPlaceholderText('Enter your email')).toBeNull()
  })

  it('shows one established email if older data also has a pending challenge', async () => {
    fixtures.channels = [
      {
        id: 'challenge-id',
        channel: 'email',
        label: 'pending@example.com',
        status: 'pending',
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        last_verification_sent_at: new Date().toISOString(),
      },
      {
        id: 'verified-id',
        channel: 'email',
        label: 'verified@example.com',
        status: 'verified',
      },
    ] as Channel[]

    render(<ContactMethods />)

    expect(await screen.findByText('verified@example.com')).toBeVisible()
    expect(screen.queryByText('pending@example.com')).toBeNull()
    expect(screen.getByRole('button', { name: 'Email options' })).toBeVisible()
    expect(screen.queryByPlaceholderText('Enter your email')).toBeNull()
  })
})
