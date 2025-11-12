import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from '@storybook/test'
import { DurationSelector } from './DurationSelector'

const pricing = {
  1: { price: 640, discount: 0, label: '1 year' },
  2: {
    price: 540,
    discount: 15,
    label: '2 years' as const,
    badge: 'best' as const,
  },
  3: { price: 540, discount: 40, label: '3 years' },
  4: { price: 540, discount: 45, label: '4 years' },
  5: { price: 540, discount: 50, label: '5 years+' },
}

const meta = {
  title: 'Features/Register/CheckAvailability/DurationSelector',
  component: DurationSelector,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    pricing,
    onSelect: fn(),
  },
} satisfies Meta<typeof DurationSelector>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    selectedDuration: 2,
  },
}

export const Disabled: Story = {
  args: {
    selectedDuration: 3,
    disabled: true,
  },
}

export const SingleYearSelected: Story = {
  args: {
    selectedDuration: 1,
  },
}
