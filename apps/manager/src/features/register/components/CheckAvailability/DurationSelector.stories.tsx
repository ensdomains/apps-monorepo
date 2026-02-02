import type { Meta, StoryObj } from '@storybook/react-vite'
import { DurationSelector } from './DurationSelector'

const pricing = {
  1: { price: 160, discount: 0, label: '1 year' },
  3: { price: 160, discount: 0, label: '3 years' },
  5: { price: 160, discount: 0, label: '5 years' },
  10: { price: 160, discount: 0, label: '10 years' },
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
    onSelect: () => {},
  },
} satisfies Meta<typeof DurationSelector>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    selectedDuration: 3,
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
