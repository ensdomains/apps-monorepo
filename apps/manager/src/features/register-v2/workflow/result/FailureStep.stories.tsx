import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { fn } from 'storybook/test'
import { FailureStepView } from './FailureStep'

const LONG_REVERT_REASON =
  'ContractFunctionExecutionError: The contract function "register" reverted with the following signature: 0x1fa9c3e2b7d84f6a90e1c5b3d7f2a8e4c6b0d9f1e3a5c7b9d1f3e5a7c9b1d3f5130d. Contract Call: address 0x253553366Da8546fC250F225fe3d25d0C782303b function register(string label, address owner, uint256 duration, bytes32 secret) args: ("mymind", 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045, 31536000, 0x9c22ff5f21f0b81b113e63f7db6da94fedef11b2119b4088b89664fb9a3cb658)'

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
    onFindAnotherName: fn(),
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

/** No message from the machine, so the fallback copy shows. */
export const WithoutMessage: Story = {
  args: { message: undefined },
}

/** Long revert with unbroken hex: wraps and scrolls inside the alert. */
export const LongRevertReason: Story = {
  args: {
    message: LONG_REVERT_REASON,
  },
}

/** Someone else got the name first: nothing to retry. */
export const NameNoLongerAvailable: Story = {
  args: {
    message: 'name-one.eth was registered by another address.',
    nameUnavailable: true,
  },
}
