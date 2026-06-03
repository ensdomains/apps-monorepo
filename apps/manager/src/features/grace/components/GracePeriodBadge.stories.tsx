import type { Meta, StoryObj } from '@storybook/react-vite'
import { GracePeriodBadge } from './GracePeriodBadge'

const meta = {
  title: 'Features/Grace/GracePeriodBadge',
  component: GracePeriodBadge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof GracePeriodBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
