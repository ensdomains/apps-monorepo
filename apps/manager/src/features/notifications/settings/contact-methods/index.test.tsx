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

describe('Notification Settings email contact methods', () => {
  it('shows the established email and an additional pending email together', async () => {
    fixtures.channels = [
      {
        id: 'verified-id',
        channel: 'email',
        label: 'verified@example.com',
        status: 'verified',
      },
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

    expect(await screen.findByText('verified@example.com')).toBeVisible()
    expect(screen.getByText('pending@example.com')).toBeVisible()
    expect(screen.getByText('Verified')).toBeVisible()
    expect(screen.getByText('Pending')).toBeVisible()
    expect(
      screen.getAllByRole('button', { name: 'Email options' }),
    ).toHaveLength(2)
    expect(
      screen.getByRole('button', { name: 'Verify Email' }),
    ).toHaveAttribute('type', 'button')
  })
})
