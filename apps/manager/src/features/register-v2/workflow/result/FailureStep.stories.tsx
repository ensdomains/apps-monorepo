import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { fn } from 'storybook/test'
import { FailureStepView } from './FailureStep'

const meta = {
  title: 'Features/Register v2/Failure page',
  component: FailureStepView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-white px-4 py-1 sm:px-8">
        <Story />
      </div>
    ),
  ],
  args: {
    label: 'mymind',
    message: 'Account not ready',
    onRetry: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof FailureStepView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/**
 * The wallet is mid-registration in another tab, so this one was refused
 * before it started. Not a failure: Back to Quote leads, and Try Again only
 * works once the other run is done.
 */
export const WalletBusyElsewhere: Story = {
  args: {
    message:
      'name-one.eth is already being registered with this wallet, possibly in another tab. One registration runs at a time, so this one has not started.',
    isWalletBusy: true,
  },
}

/** Someone else got the name first: nothing to retry. */
export const NameNoLongerAvailable: Story = {
  args: {
    message: 'name-one.eth was registered by another address.',
    nameUnavailable: true,
  },
}
