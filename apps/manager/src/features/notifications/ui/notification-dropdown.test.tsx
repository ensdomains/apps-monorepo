import { render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationsDropdown } from './notification-dropdown'

const mockUseInfiniteQuery = vi.fn()

vi.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: () => mockUseInfiniteQuery(),
}))

vi.mock('@/features/notifications/queries/notifications', () => ({
  notificationsInfiniteQuery: {},
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}))

vi.mock('@/features/notifications/ui/items/notification-item', () => ({
  ResolvedNotificationItem: ({
    resolved,
  }: {
    resolved: { notification: { kind: string } }
  }) => <div data-testid="notification-item">{resolved.notification.kind}</div>,
}))

vi.mock('@/features/notifications/ui/unread-count', () => ({
  UnreadCount: () => <div>0</div>,
}))

describe('NotificationsDropdown', () => {
  beforeEach(() => {
    mockUseInfiniteQuery.mockReset()
  })

  it('shows loading state', () => {
    mockUseInfiniteQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    })

    const { container } = render(<NotificationsDropdown />)
    expect(container.querySelector('.animate-spin')).toBeTruthy()
  })

  it('shows error state', () => {
    mockUseInfiniteQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    })

    render(<NotificationsDropdown />)
    expect(screen.getByText('Failed to load notifications')).toBeTruthy()
  })

  it('shows top 5 renderable notifications when available', () => {
    const validExpiryPayload = {
      name: 'example.eth',
      expiryDate: Date.now() + 1_000_000,
      isOwner: true,
      watchReason: 'owned',
    }

    mockUseInfiniteQuery.mockReturnValue({
      data: [
        {
          id: '1',
          kind: 'name-expiry',
          payload: validExpiryPayload,
          source: 'personal',
          seen: false,
          timestamp: Date.now(),
        },
        {
          id: '2',
          kind: 'name-expiry',
          payload: validExpiryPayload,
          source: 'personal',
          seen: false,
          timestamp: Date.now(),
        },
        {
          id: '3',
          kind: 'name-expiry',
          payload: validExpiryPayload,
          source: 'personal',
          seen: false,
          timestamp: Date.now(),
        },
        {
          id: '4',
          kind: 'name-expiry',
          payload: validExpiryPayload,
          source: 'personal',
          seen: false,
          timestamp: Date.now(),
        },
        {
          id: '5',
          kind: 'name-expiry',
          payload: validExpiryPayload,
          source: 'personal',
          seen: false,
          timestamp: Date.now(),
        },
        {
          id: '6',
          kind: 'name-expiry',
          payload: validExpiryPayload,
          source: 'personal',
          seen: false,
          timestamp: Date.now(),
        },
      ],
      isLoading: false,
      isError: false,
    })

    render(<NotificationsDropdown />)
    expect(screen.getAllByTestId('notification-item')).toHaveLength(5)
  })

  it('filters invalid notifications', () => {
    mockUseInfiniteQuery.mockReturnValue({
      data: [
        {
          id: '1',
          kind: 'ens-update',
          payload: { title: 'Good', summary: 'Summary' },
          source: 'broadcast',
          seen: false,
          timestamp: Date.now(),
        },
        {
          id: '2',
          kind: 'ens-update',
          payload: { title: 'Bad', summary: 123 },
          source: 'broadcast',
          seen: false,
          timestamp: Date.now(),
        },
      ],
      isLoading: false,
      isError: false,
    })

    render(<NotificationsDropdown />)
    expect(screen.getAllByTestId('notification-item')).toHaveLength(1)
  })

  it('shows empty state when no renderable notifications exist', () => {
    mockUseInfiniteQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    })

    render(<NotificationsDropdown />)
    expect(screen.getByText('Nothing here yet!')).toBeTruthy()
  })
})
