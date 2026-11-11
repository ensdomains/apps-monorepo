import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { NameCopyButton } from './NameCopyButton'

const meta = {
  title: 'Atoms/NameCopyButton',
  component: NameCopyButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    name: 'rustic-sparrow.eth',
  },
} satisfies Meta<typeof NameCopyButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
