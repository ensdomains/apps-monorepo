import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { CommemorativeNftMintBanner } from './CommemorativeNftMintBanner'

const meta = {
  title: 'Migration/Commemorative NFT Mint Banner',
  component: CommemorativeNftMintBanner,
  args: { onMint: () => undefined },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-7xl py-6 md:w-[calc(100%-4rem)]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CommemorativeNftMintBanner>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Checking: Story = {
  args: { disabled: true },
}
