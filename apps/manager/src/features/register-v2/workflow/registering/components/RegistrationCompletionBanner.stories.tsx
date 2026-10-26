import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { RegistrationCompletionBanner } from './RegistrationCompletionBanner'

const meta = {
  title: 'Features/Register v2/Registration completion banner',
  component: RegistrationCompletionBanner,
  decorators: [
    (Story) => (
      <div className="max-w-xl bg-white p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RegistrationCompletionBanner>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
