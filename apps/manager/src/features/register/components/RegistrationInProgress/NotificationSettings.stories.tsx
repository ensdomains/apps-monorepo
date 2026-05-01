import type { Meta, StoryObj } from '@storybook/react-vite'
import { channelsQueryOptions } from '@/features/notifications/data/queries/channels'
import { preferencesQueryOptions } from '@/features/notifications/data/queries/preferences'
import { browserPushStateQueryOptions } from '@/features/notifications/data/queries/push'
import { withProviders } from '../../../../../.storybook/decorators'
import { NotificationSettings } from './NotificationSettings'

/**
 * Stories for the new condensed NotificationSettings screen shown during the
 * registration flow.
 *
 * Each story seeds the relevant React Query caches via `withProviders` so the
 * component renders without trying to hit the backend. To exercise the
 * different visual states, swap `channels` and `preferences` seeds.
 */

const meta = {
  title: 'Features/Register/NotificationSettings',
  component: NotificationSettings,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-[#FCFBFB] p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    onConfirm: () => console.log('Notification preferences confirmed'),
    onSkip: () => console.log('Skip clicked'),
  },
} satisfies Meta<typeof NotificationSettings>

export default meta
type Story = StoryObj<typeof meta>

// `browserPushStateQueryOptions` is built with `resultQueryOptions`, which
// auto-unwraps the Result, so the cached value is the inner object — no
// `_tag`/`value` wrapper needed in the seed.
const browserPushStateUnsupported = {
  isSupported: false,
  permission: 'default' as const,
  endpointHash: null,
}

// `isSupported: true` + `permission: 'default'` is the combination that makes
// PushContactMethod render the outlined ENABLE button (the Figma idle state).
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

/**
 * Default state shown immediately after the user lands on the screen during
 * registration: no contact methods set up, no saved preferences, "Save and
 * Continue" disabled until at least one channel verifies.
 */
export const Default: Story = {
  decorators: [
    withProviders({
      seeds: [
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
      ],
    }),
  ],
}

/**
 * State after the user has verified an email contact method. "Save and
 * Continue" is enabled (lightBlue), and the user can tweak preference cards.
 */
export const WithVerifiedEmail: Story = {
  decorators: [
    withProviders({
      seeds: [
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
      ],
    }),
  ],
}

/**
 * State where the user has a pending email verification, awaiting confirmation
 * from the link in the email. "Save and Continue" remains disabled until the
 * channel verifies.
 */
export const PendingEmailVerification: Story = {
  decorators: [
    withProviders({
      seeds: [
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
      ],
    }),
  ],
}

/**
 * Browser-push idle state: the runtime supports push but the user hasn't
 * granted permission yet, so the browser-notifications row renders the
 * outlined ENABLE button (Lapis-900 border, Lapis-Dense text — matches
 * Figma node 1949:79141).
 */
export const BrowserPushEnableButton: Story = {
  decorators: [
    withProviders({
      seeds: [
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
      ],
    }),
  ],
}

/**
 * Power-user state: every preference toggled on, every contact method
 * verified. Useful for visually checking the "all selected" preference cards.
 */
export const AllPreferencesEnabled: Story = {
  decorators: [
    withProviders({
      seeds: [
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
      ],
    }),
  ],
}
