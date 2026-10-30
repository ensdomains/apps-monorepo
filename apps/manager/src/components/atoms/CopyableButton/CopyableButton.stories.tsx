import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { CopyableButton } from './CopyableButton'

const meta = {
  title: 'Atoms/CopyableButton',
  component: CopyableButton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    value: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    children: '0xd8dA...6045',
  },
} satisfies Meta<typeof CopyableButton>

export default meta
type Story = StoryObj<typeof meta>

export const Outline: Story = {}

export const Ghost: Story = {
  args: { variant: 'ghost' },
}

export const SmallIcon: Story = {
  args: {
    children: 'Copy',
    iconClassName: 'ms-opsz-20 text-base leading-none',
  },
}

export const Disabled: Story = {
  args: { disabled: true },
}
