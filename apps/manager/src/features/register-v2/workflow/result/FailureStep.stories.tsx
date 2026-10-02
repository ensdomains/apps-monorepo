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
