import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { GrainOverlay } from './GrainOverlay'
import { SmartTransactionsNotice } from './SmartTransactionsNotice'

// Laid out like the left column of the upgrade footer it renders in.
const meta = {
  title: 'Migration/Smart Transactions Notice',
  component: SmartTransactionsNotice,
  decorators: [
    (Story) => (
      <div className="relative w-full bg-linear-to-b from-ens-garnet-100 to-ens-garnet-200 px-5 py-4 sm:px-8">
        <GrainOverlay />
        <div className="relative flex min-w-0 max-w-107.5 flex-col gap-1 text-ens-garnet-900/75 text-xs leading-normal tracking-[-0.24px] sm:text-sm sm:leading-[1.2] sm:tracking-[-0.28px]">
          <p>You&apos;ll approve 3 requests.</p>
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof SmartTransactionsNotice>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Mobile: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
}
