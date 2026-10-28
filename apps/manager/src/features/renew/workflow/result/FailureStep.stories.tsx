import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { RenewalUiProvider } from '../../state/renewalUi.context'
import { RenewFailureStep } from './FailureStep'

// 2026-01-01T00:00:00Z, in seconds
const CURRENT_EXPIRY = 1_767_225_600n

const meta = {
  title: 'Features/Renew/Failure page',
  component: RenewFailureStep,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      // The provider starts a fresh machine, so no error message is set and
      // the fallback copy shows. Revert reasons are covered in UI/Alert.
      <RenewalUiProvider
        currentExpiry={CURRENT_EXPIRY}
        label="mymind"
        protocol="v2"
      >
        <div className="min-h-screen bg-white px-4 py-1 sm:px-8">
          <Story />
        </div>
      </RenewalUiProvider>
    ),
  ],
} satisfies Meta<typeof RenewFailureStep>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
