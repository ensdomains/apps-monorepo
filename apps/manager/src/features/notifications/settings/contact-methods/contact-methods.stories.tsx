import { Trans } from '@lingui/react/macro'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { MSymbol } from '@/components/ui/material-symbol'
import { channelsQueryOptions } from '@/features/notifications/data/queries/channels'
import { browserPushStateQueryOptions } from '@/features/notifications/data/queries/push'
import { withProviders } from '../../../../../.storybook/decorators'
import { ContactMethodCard } from './contact-method-card'
import { PushContactMethod } from './push'

/**
 * Visual checks for contact-method rows, especially browser push with the
 * outlined ENABLE control (Figma). Prefer these focused stories over loading
 * the full registration/settings screen when iterating on layout.
 */

const settingsCardShell = (children: React.ReactNode) => (
  <div className="w-full max-w-xl rounded-xl border-[#ddddde] border-[0.5px] bg-white p-6 shadow-[0px_4px_24.1px_rgba(7,28,47,0.07)]">
    {children}
  </div>
)

const meta = {
  title: 'Features/Notifications/Contact methods',
  parameters: { layout: 'centered' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** Static card chrome + browser-not button (no React Query). */
export const BrowserNotificationsEnableCard: Story = {
  name: 'Browser notifications / Enable (card only)',
  render: () =>
    settingsCardShell(
      <ContactMethodCard
        actionLabel="Enable"
        description="Get instant push notifications in your browser"
        icon={
          <MSymbol
            className="ms-opsz-18 ms-wght-400 text-ens-lapis-core not-italic leading-[19.6px]"
            symbol="computer"
          />
        }
        onAction={() => {}}
        title={<Trans>Browser Notifications</Trans>}
        variant="browser-not"
      />,
    ),
}

/** Same UI as the app: `PushContactMethod` when permission is still `default`. */
export const BrowserNotificationsEnablePushRow: Story = {
  name: 'Browser notifications / Enable (PushContactMethod)',
  decorators: [
    withProviders({
      seeds: [
        { key: channelsQueryOptions.queryKey, data: [] },
        {
          key: browserPushStateQueryOptions.queryKey,
          data: {
            isSupported: true,
            permission: 'default' as const,
            endpointHash: null,
          },
        },
      ],
    }),
  ],
  render: () =>
    settingsCardShell(
      <>
        <h2 className="mb-4 font-normal font-sans text-base text-ens-blue-dark leading-ens-normal">
          Contact methods
        </h2>
        <PushContactMethod pushChannels={[]} />
      </>,
    ),
}
