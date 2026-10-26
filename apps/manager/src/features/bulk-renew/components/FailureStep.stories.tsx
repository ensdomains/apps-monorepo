import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { fn } from 'storybook/test'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { FailureStep } from './FailureStep'

const LONG_REVERT_REASON =
  'ContractFunctionExecutionError: The contract function "renewBatch" reverted with the following signature: 0x1fa9c3e2b7d84f6a90e1c5b3d7f2a8e4c6b0d9f1e3a5c7b9d1f3e5a7c9b1d3f5130d. Contract Call: address 0x253553366Da8546fC250F225fe3d25d0C782303b function renewBatch(string[] labels, uint256 duration) args: (["mymind","nick","vitalik"], 31536000) sender: 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

const meta = {
  title: 'Features/Bulk Renew/Failure step',
  component: FailureStep,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      // DialogTitle needs a Dialog around it; this mirrors BulkRenewDialog.
      <Dialog open>
        <DialogContent className="sm:max-w-xl" showCloseButton={false}>
          <Story />
        </DialogContent>
      </Dialog>
    ),
  ],
  args: {
    errorMessage: 'User rejected the request.',
    onRetry: fn(),
    onBack: fn(),
  },
} satisfies Meta<typeof FailureStep>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** No message from the wallet, so the fallback copy shows. */
export const WithoutMessage: Story = {
  args: { errorMessage: undefined },
}

/** Long revert with unbroken hex: wraps and scrolls inside the alert. */
export const LongRevertReason: Story = {
  args: { errorMessage: LONG_REVERT_REASON },
}
