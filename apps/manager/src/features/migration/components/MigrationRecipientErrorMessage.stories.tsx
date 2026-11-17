import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { MigrationRecipientErrorMessage } from './MigrationRecipientErrorMessage'

const meta = {
  title: 'Migration/RecipientErrorMessage',
  component: MigrationRecipientErrorMessage,
  args: {
    error: {
      type: 'recipient-incompatible',
      recipient: '0x00000000000000000000000000000000000000AB',
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg rounded-sm bg-ens-garnet-200 p-5 text-center text-ens-garnet-900 text-sm leading-relaxed">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MigrationRecipientErrorMessage>

export default meta
type Story = StoryObj<typeof meta>

export const Incompatible: Story = {}

export const NetworkUnavailable: Story = {
  args: {
    error: {
      type: 'recipient-unavailable',
      recipient: '0x00000000000000000000000000000000000000AB',
    },
  },
}
