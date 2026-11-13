import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { NameFallbackCard } from './NameFallbackCard'

const meta = {
  title: 'Components/NameFallbackCard',
  component: NameFallbackCard,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof NameFallbackCard>

export default meta
type Story = StoryObj<typeof meta>

export const AddressLike: Story = {
  args: {
    name: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045.eth',
    reason: 'address-like',
  },
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
}

export const AddressLikeMobile: Story = {
  args: AddressLike.args,
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
}

export const TooShort: Story = {
  args: {
    name: 'ab.eth',
    reason: 'too-short',
  },
}
