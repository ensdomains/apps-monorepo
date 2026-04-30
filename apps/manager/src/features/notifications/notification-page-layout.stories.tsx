import type { Meta, StoryObj } from '@storybook/react-vite'
import { channelsQueryOptions } from '@/features/notifications/data/queries/channels'
import {
  type BackendNotification,
  notificationsInfiniteQuery,
  unreadCountQuery,
} from '@/features/notifications/data/queries/notifications'
import { preferencesQueryOptions } from '@/features/notifications/data/queries/preferences'
import { AllNotificationsPage } from '@/routes/notifications/_authenticated/index'
import { NotificationSettingsPage } from '@/routes/notifications/_authenticated/settings/index'
import { withProviders } from '../../../.storybook/decorators'

/**
 * Stories for the real notification page components used by the routes
 * `/notifications` and `/notifications/settings`. Mounting the actual
 * components (rather than re-creating their JSX) means any styling or logic
 * regression here surfaces in Storybook the same way it does in the app.
 *
 * Each story seeds the relevant queries via `withProviders` so React Query
 * never tries to hit the backend.
 */

// ---- helpers ---------------------------------------------------------------

type InfiniteQueryData = {
  pages: Array<{
    notifications: BackendNotification[]
    nextCursor: string | null
  }>
  pageParams: Array<string | undefined>
}

const buildInfinite = (
  notifications: BackendNotification[],
): InfiniteQueryData => ({
  pages: [{ notifications, nextCursor: null }],
  pageParams: [undefined],
})

const sampleNotifications: BackendNotification[] = [
  {
    id: 'n-1',
    source: 'personal',
    kind: 'name-expiry',
    seen: false,
    timestamp: Date.now() - 1000 * 60 * 60 * 2,
    payload: {
      name: 'alice.eth',
      expiryDate: Date.now() + 1000 * 60 * 60 * 24 * 12,
      isOwner: true,
      watchReason: 'owned',
    },
  },
  {
    id: 'n-2',
    source: 'personal',
    kind: 'name-expiry',
    seen: false,
    timestamp: Date.now() - 1000 * 60 * 60 * 24,
    payload: {
      name: 'lapsed.eth',
      expiryDate: Date.now() - 1000 * 60 * 60 * 24 * 2,
      isOwner: true,
      watchReason: 'owned',
    },
  },
  {
    id: 'n-3',
    source: 'personal',
    kind: 'name-transferred',
    seen: true,
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 3,
    payload: {
      name: 'vault.alice.eth',
      txHash:
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      to: '0x1234567890abcdef1234567890abcdef12345678',
    },
  },
  {
    id: 'n-4',
    source: 'broadcast',
    kind: 'ens-update',
    seen: true,
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 5,
    payload: {
      title: 'Manager v4 beta is live',
      summary: 'The redesigned manager experience is now in public beta.',
      url: 'https://ens.domains',
    },
  },
]

// ---- meta ------------------------------------------------------------------

const PageShell = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-screen flex-col bg-[#FCFBFB]">{children}</div>
)

const meta = {
  title: 'Features/Notifications/Page Layout',
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <PageShell>
        <Story />
      </PageShell>
    ),
  ],
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

// ---- All Notifications page -----------------------------------------------

export const AllNotifications: Story = {
  name: 'All Notifications / Empty',
  decorators: [
    withProviders({
      seeds: [
        {
          key: notificationsInfiniteQuery.queryKey,
          data: buildInfinite([]),
        },
        {
          key: unreadCountQuery.queryKey,
          data: { unreadCount: 0 },
        },
      ],
    }),
  ],
  render: () => <AllNotificationsPage />,
}

export const AllNotificationsWithContent: Story = {
  name: 'All Notifications / With Content',
  decorators: [
    withProviders({
      seeds: [
        {
          key: notificationsInfiniteQuery.queryKey,
          data: buildInfinite(sampleNotifications),
        },
        {
          key: unreadCountQuery.queryKey,
          data: { unreadCount: 2 },
        },
      ],
    }),
  ],
  render: () => <AllNotificationsPage />,
}

// ---- Notification Settings page -------------------------------------------

export const SettingsPage: Story = {
  name: 'Settings Page',
  decorators: [
    withProviders({
      seeds: [
        {
          key: channelsQueryOptions.queryKey,
          data: [],
        },
        {
          key: preferencesQueryOptions.queryKey,
          data: [],
        },
      ],
    }),
  ],
  render: () => <NotificationSettingsPage />,
}
