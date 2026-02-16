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

vi.mock('@/features/notifications/components/items', () => ({
  NotificationItem: ({ notification }: { notification: { kind: string } }) => (
    <div data-testid="notification-item">{notification.kind}</div>
  ),
}))

vi.mock('./unread-count', () => ({
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

  it('shows top 5 notifications when available', () => {
    mockUseInfiniteQuery.mockReturnValue({
      data: [
        { id: '1', kind: 'name-expiry' },
        { id: '2', kind: 'name-expiry' },
        { id: '3', kind: 'name-expiry' },
        { id: '4', kind: 'name-expiry' },
        { id: '5', kind: 'name-expiry' },
        { id: '6', kind: 'name-expiry' },
      ],
      isLoading: false,
      isError: false,
    })

    render(<NotificationsDropdown />)
    expect(screen.getAllByTestId('notification-item')).toHaveLength(5)
  })

  it('shows empty state when no notifications exist', () => {
    mockUseInfiniteQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    })

    render(<NotificationsDropdown />)
    expect(screen.getByText('Nothing here yet!')).toBeTruthy()
  })
})
