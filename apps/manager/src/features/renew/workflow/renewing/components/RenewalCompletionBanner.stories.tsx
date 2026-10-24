import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { RenewalCompletionBanner } from './RenewalCompletionBanner'

const meta = {
  title: 'Features/Renew/Renewal completion banner',
  component: RenewalCompletionBanner,
  decorators: [
    (Story) => (
      <div className="max-w-xl bg-white p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RenewalCompletionBanner>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
