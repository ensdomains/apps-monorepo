import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { PrimaryNameV1Warning } from './PrimaryNameV1Warning'

const meta = {
  title: 'Features/Dashboard/Primary name v1 warning',
  component: PrimaryNameV1Warning,
  decorators: [
    (Story) => (
      <div className="max-w-xl bg-white p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    isError: false,
    upgradeableNameCount: 3,
  },
} satisfies Meta<typeof PrimaryNameV1Warning>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** The names query failed, so the warning shows to be safe. */
export const QueryError: Story = {
  args: { isError: true, upgradeableNameCount: 0 },
}

/** Nothing to upgrade: renders nothing. */
export const Hidden: Story = {
  args: { upgradeableNameCount: 0 },
}
