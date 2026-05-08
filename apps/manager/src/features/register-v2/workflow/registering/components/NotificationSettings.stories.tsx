import type { Decorator, Meta, StoryObj } from '@storybook/react-vite'
import { useSelector as useStoreSelector } from '@xstate/store-react'
import { useLayoutEffect } from 'react'
import { channelsQueryOptions } from '@/features/notifications/data/queries/channels'
import { preferencesQueryOptions } from '@/features/notifications/data/queries/preferences'
import { browserPushStateQueryOptions } from '@/features/notifications/data/queries/push'
import { backendAuthStore, isBackendAuthed } from '@/utils/backend-client'
import { withProviders } from '../../../../../../.storybook/decorators'
import { NotificationSettings } from './NotificationSettings'

/**
 * Registration notification step. Gates the contact-methods + preferences
 * grid on `isBackendAuthed` and disables the preferences query until the
 * wallet is verified — stories seed `backendAuthStore` via `WaitForBackendAuth`
 * so both branches render predictably in Storybook.
 */

const STORY_AUTH_KEY = 'storybook-notification-settings-step'
const STORY_ADDRESS = '0x0000000000000000000000000000000000000001'

const browserPushStateUnsupported = {
  isSupported: false,
  permission: 'default' as const,
  endpointHash: null,
}

const browserPushStateSupportedDefault = {
  isSupported: true,
  permission: 'default' as const,
  endpointHash: null,
}

const browserPushStateGrantedDisabled = {
  isSupported: true,
  permission: 'granted' as const,
  endpointHash: null,
}

function WaitForBackendAuth({
  expectAuthed,
  children,
}: {
  expectAuthed: boolean
  children: React.ReactNode
}) {
  const isAuthed = useStoreSelector(isBackendAuthed)

  useLayoutEffect(() => {
    if (expectAuthed) {
      backendAuthStore.trigger.signIn({
        authKey: STORY_AUTH_KEY,
        address: STORY_ADDRESS,
      })
    } else {
      backendAuthStore.trigger.signOut()
    }
    return () => {
      backendAuthStore.trigger.signOut()
    }
  }, [expectAuthed])

  if (isAuthed !== expectAuthed) {
    return (
      <p className="text-ens-slate-600 text-sm leading-ens-normal">
        Preparing story…
      </p>
    )
  }

  return <>{children}</>
}

const shell: Decorator = (Story) => (
  <div className="min-h-screen bg-[#FCFBFB] p-6">
    <Story />
  </div>
)

const storyDecorators = (
  expectAuthed: boolean,
  seeds: Array<{ key: readonly unknown[]; data: unknown }>,
): Decorator[] => [
  shell,
  withProviders({ seeds }),
  (Story) => (
    <WaitForBackendAuth expectAuthed={expectAuthed}>
      <Story />
    </WaitForBackendAuth>
  ),
]

const meta = {
  title: 'Features/Register v2/NotificationSettings',
  component: NotificationSettings,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  args: {
    onConfirm: () => {
      console.log('Notification preferences confirmed')
    },
    onSkip: () => {
      console.log('Skip clicked')
    },
  },
} satisfies Meta<typeof NotificationSettings>

export default meta
type Story = StoryObj<typeof meta>

/** Wallet not verified — CTA panel instead of contact methods + preferences. */
export const NotAuthenticated: Story = {
  decorators: storyDecorators(false, [
    { key: channelsQueryOptions.queryKey, data: [] },
    {
      key: preferencesQueryOptions.queryKey,
      data: {
        settings: {
          ownedNameExpiry: false,
          ensLabsUpdates: false,
          favouritedNameExpiry: false,
        },
        verifiedChannels: [],
      },
    },
    {
      key: browserPushStateQueryOptions.queryKey,
      data: browserPushStateUnsupported,
    },
  ]),
}

/** Authed, no verified channels — Save and Continue disabled. */
export const Default: Story = {
  decorators: storyDecorators(true, [
    { key: channelsQueryOptions.queryKey, data: [] },
    {
      key: preferencesQueryOptions.queryKey,
      data: {
        settings: {
          ownedNameExpiry: false,
          ensLabsUpdates: false,
          favouritedNameExpiry: false,
        },
        verifiedChannels: [],
      },
    },
    {
      key: browserPushStateQueryOptions.queryKey,
      data: browserPushStateUnsupported,
    },
  ]),
}

/** Verified email — preferences load and primary action is enabled. */
export const WithVerifiedEmail: Story = {
  decorators: storyDecorators(true, [
    {
      key: channelsQueryOptions.queryKey,
      data: [
        {
          id: 'email-1',
          channel: 'email',
          label: 'edax@ens.domains',
          status: 'verified',
        },
      ],
    },
    {
      key: preferencesQueryOptions.queryKey,
      data: {
        settings: {
          ownedNameExpiry: true,
          ensLabsUpdates: false,
          favouritedNameExpiry: false,
        },
        verifiedChannels: ['email-1'],
      },
    },
    {
      key: browserPushStateQueryOptions.queryKey,
      data: browserPushStateGrantedDisabled,
    },
  ]),
}

export const PendingEmailVerification: Story = {
  decorators: storyDecorators(true, [
    {
      key: channelsQueryOptions.queryKey,
      data: [
        {
          id: 'email-1',
          channel: 'email',
          label: 'edax@ens.domains',
          status: 'pending',
        },
      ],
    },
    {
      key: preferencesQueryOptions.queryKey,
      data: {
        settings: {
          ownedNameExpiry: false,
          ensLabsUpdates: false,
          favouritedNameExpiry: false,
        },
        verifiedChannels: [],
      },
    },
    {
      key: browserPushStateQueryOptions.queryKey,
      data: browserPushStateUnsupported,
    },
  ]),
}

export const BrowserPushEnableButton: Story = {
  decorators: storyDecorators(true, [
    { key: channelsQueryOptions.queryKey, data: [] },
    {
      key: preferencesQueryOptions.queryKey,
      data: {
        settings: {
          ownedNameExpiry: false,
          ensLabsUpdates: false,
          favouritedNameExpiry: false,
        },
        verifiedChannels: [],
      },
    },
    {
      key: browserPushStateQueryOptions.queryKey,
      data: browserPushStateSupportedDefault,
    },
  ]),
}

export const AllPreferencesEnabled: Story = {
  decorators: storyDecorators(true, [
    {
      key: channelsQueryOptions.queryKey,
      data: [
        {
          id: 'email-1',
          channel: 'email',
          label: 'edax@ens.domains',
          status: 'verified',
        },
        {
          id: 'tg-1',
          channel: 'telegram',
          label: '@edax',
          status: 'verified',
        },
      ],
    },
    {
      key: preferencesQueryOptions.queryKey,
      data: {
        settings: {
          ownedNameExpiry: true,
          ensLabsUpdates: true,
          favouritedNameExpiry: true,
        },
        verifiedChannels: ['email-1', 'tg-1'],
      },
    },
    {
      key: browserPushStateQueryOptions.queryKey,
      data: browserPushStateGrantedDisabled,
    },
  ]),
}
