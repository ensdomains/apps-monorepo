import type { Meta, StoryObj } from '@storybook/react-vite'
import { Bell } from 'lucide-react'
import {
  type ButtonHTMLAttributes,
  forwardRef,
  type ReactNode,
  useState,
} from 'react'
import * as Drawer from '@/components/ui/drawer'
import * as Popover from '@/components/ui/popover'
import {
  type BackendNotification,
  notificationsInfiniteQuery,
} from '@/features/notifications/data/queries/notifications'
import { withProviders } from '../../../../.storybook/decorators'
import { NotificationsDropdown } from './notification-dropdown'

/**
 * Stories for the real `NotificationsDropdown` component, mounted inside the
 * actual `Drawer` (mobile) / `Popover` (desktop) wrappers used by the app.
 *
 * Each story seeds `notificationsInfiniteQuery` with the data shape its state
 * needs, so we exercise the same render path as the running app.
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

// Sample notifications cover the kinds with personal payloads that render
// `<Link>`s — exercises the router wiring.
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
    kind: 'name-transferred',
    seen: false,
    timestamp: Date.now() - 1000 * 60 * 60 * 24,
    payload: {
      name: 'vault.alice.eth',
      txHash:
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      to: '0x1234567890abcdef1234567890abcdef12345678',
    },
  },
  {
    id: 'n-3',
    source: 'broadcast',
    kind: 'ens-update',
    seen: true,
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 3,
    payload: {
      title: 'Manager v4 beta is live',
      summary:
        'The redesigned manager experience is now in public beta. Take a look.',
      url: 'https://ens.domains',
    },
  },
]

// ---- triggers / harnesses --------------------------------------------------

const TriggerStub = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>((props, ref) => (
  <button
    aria-label="Notifications"
    ref={ref}
    type="button"
    {...props}
    className="relative flex items-center justify-center rounded p-2 text-[#4B4B4B] transition-colors hover:bg-ens-white"
  >
    <Bell className="size-5" />
  </button>
))
TriggerStub.displayName = 'TriggerStub'

const MobileDrawerHarness = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(true)
  return (
    <div className="flex min-h-screen flex-col bg-[#FCFBFB] p-4">
      <Drawer.Drawer onOpenChange={setOpen} open={open}>
        <Drawer.DrawerTrigger asChild>
          <TriggerStub />
        </Drawer.DrawerTrigger>
        <Drawer.DrawerContent>
          <div className="px-6 pt-2 pb-8">{children}</div>
        </Drawer.DrawerContent>
      </Drawer.Drawer>
    </div>
  )
}

const DesktopPopoverHarness = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(true)
  return (
    <div className="flex min-h-screen items-start justify-end bg-[#FCFBFB] p-6">
      <Popover.Popover onOpenChange={setOpen} open={open}>
        <Popover.PopoverTrigger asChild>
          <TriggerStub />
        </Popover.PopoverTrigger>
        <Popover.PopoverContent
          className="w-sm"
          collisionPadding={16}
          sideOffset={16}
        >
          {children}
        </Popover.PopoverContent>
      </Popover.Popover>
    </div>
  )
}

// ---- meta ------------------------------------------------------------------

const meta = {
  title: 'Features/Notifications/Drawer (mobile)',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

// ---- mobile drawer stories -------------------------------------------------

export const Empty: Story = {
  decorators: [
    withProviders({
      seeds: [
        {
          key: notificationsInfiniteQuery.queryKey,
          data: buildInfinite([]),
        },
      ],
    }),
  ],
  render: () => (
    <MobileDrawerHarness>
      <NotificationsDropdown />
    </MobileDrawerHarness>
  ),
}

export const WithNotifications: Story = {
  decorators: [
    withProviders({
      seeds: [
        {
          key: notificationsInfiniteQuery.queryKey,
          data: buildInfinite(sampleNotifications),
        },
      ],
    }),
  ],
  render: () => (
    <MobileDrawerHarness>
      <NotificationsDropdown />
    </MobileDrawerHarness>
  ),
}

// ---- desktop popover stories ----------------------------------------------

export const DesktopPopoverWithNotifications: Story = {
  name: 'Desktop Popover / With Notifications',
  decorators: [
    withProviders({
      seeds: [
        {
          key: notificationsInfiniteQuery.queryKey,
          data: buildInfinite(sampleNotifications),
        },
      ],
    }),
  ],
  render: () => (
    <DesktopPopoverHarness>
      <NotificationsDropdown />
    </DesktopPopoverHarness>
  ),
}

export const DesktopPopoverEmpty: Story = {
  name: 'Desktop Popover / Empty',
  decorators: [
    withProviders({
      seeds: [
        {
          key: notificationsInfiniteQuery.queryKey,
          data: buildInfinite([]),
        },
      ],
    }),
  ],
  render: () => (
    <DesktopPopoverHarness>
      <NotificationsDropdown />
    </DesktopPopoverHarness>
  ),
}
