import { describe, expect, it } from 'vitest'
import { render } from '@/utils/test-utils'
import { NotificationItem } from './index'

describe('NotificationItem renderer resolution', () => {
  it('uses kind override renderer for known kinds', () => {
    const { getByText } = render(
      <NotificationItem
        notification={{
          id: '1',
          kind: 'name-expiry',
          payload: {
            name: 'example.eth',
            expiryDate: Date.now() + 1_000_000,
            isOwner: true,
            watchReason: 'owned',
          },
          source: 'personal',
          seen: false,
          timestamp: Date.now(),
        }}
      />,
    )

    expect(getByText('example.eth')).toBeInTheDocument()
  })

  it('uses template renderer for catalog kinds without overrides', () => {
    const { getByText } = render(
      <NotificationItem
        notification={{
          id: '2',
          kind: 'ens-update',
          payload: {
            title: 'ENS Policy Update',
            summary: 'Pricing update details',
            url: 'https://ens.domains',
          },
          source: 'broadcast',
          seen: false,
          timestamp: Date.now(),
        }}
      />,
    )

    expect(getByText('ENS Policy Update')).toBeInTheDocument()
    expect(getByText('Pricing update details')).toBeInTheDocument()
  })

  it('falls back safely for unknown kinds', () => {
    const unknownNotification = {
      id: '3',
      kind: 'future-kind',
      payload: {},
      source: 'personal',
      seen: false,
      timestamp: Date.now(),
    }

    const { getByText } = render(
      <NotificationItem
        notification={
          unknownNotification as Parameters<
            typeof NotificationItem
          >[0]['notification']
        }
      />,
    )

    expect(getByText('Notification')).toBeInTheDocument()
  })
})
