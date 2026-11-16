import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { AddressLikeNameNotice } from './AddressLikeNameNotice'

const meta = {
  title: 'Features/Profile/Address-like name notice',
  component: AddressLikeNameNotice,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="mx-auto w-full max-w-226.25 p-4 py-10">
        <Story />
      </div>
    ),
  ],
  args: {
    name: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045.eth',
  },
} satisfies Meta<typeof AddressLikeNameNotice>

export default meta
type Story = StoryObj<typeof meta>

export const EvmAddressLike: Story = {
  parameters: { viewport: { defaultViewport: 'desktop' } },
}

export const EvmAddressLikeMobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}

export const BitcoinAddressLike: Story = {
  args: { name: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq.eth' },
}

export const SolanaAddressLike: Story = {
  args: { name: '9wzdxwbbmkg8ztbnmquxvqrayrzzdsgydlvl9zytawwm.eth' },
}

/** Ordinary names render nothing. */
export const OrdinaryName: Story = {
  args: { name: 'vitalik.eth' },
}
