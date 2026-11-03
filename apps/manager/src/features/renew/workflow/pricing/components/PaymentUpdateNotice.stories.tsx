import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { PaymentUpdateNotice } from './PaymentUpdateNotice'

const meta = {
  title: 'Features/Renew/Payment update notice',
  component: PaymentUpdateNotice,
  decorators: [
    (Story) => (
      <div className="max-w-[420px] bg-white p-6">
        <Story />
      </div>
    ),
  ],
  args: { status: 'reviewing', needsApproval: true },
} satisfies Meta<typeof PaymentUpdateNotice>

export default meta
type Story = StoryObj<typeof meta>

export const Reviewing: Story = {}

export const SigningWithApproval: Story = {
  args: { status: 'accepted' },
}

export const SigningRenewalOnly: Story = {
  args: { status: 'accepted', needsApproval: false },
}

export const Mobile: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
}
