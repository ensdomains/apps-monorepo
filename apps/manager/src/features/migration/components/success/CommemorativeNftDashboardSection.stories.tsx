import type { Meta, StoryObj } from '@storybook/tanstack-react'
import type { Address } from 'viem'
import { PublishedNftStory, publishedNftStoryOwner } from '../PublishedNftStory'
import { CommemorativeNftDashboardCard } from './CommemorativeNftDashboardSection'

const DashboardPreview = ({
  ownerAddress,
}: {
  readonly ownerAddress: Address
}) => (
  <PublishedNftStory minted ownerAddress={ownerAddress}>
    {({ state, retry }) => (
      <div className="mx-auto w-full max-w-7xl py-6 md:w-[calc(100%-4rem)]">
        {state.status === 'minted' ? (
          <CommemorativeNftDashboardCard card={state.card} />
        ) : (
          <div className="p-6 text-center" role="status">
            {state.status === 'error'
              ? state.message
              : state.status === 'ineligible'
                ? 'No generated NFT is published for this wallet.'
                : 'Loading the published NFT…'}
            {state.status === 'error' ? (
              <button className="ml-3 underline" onClick={retry} type="button">
                Retry
              </button>
            ) : null}
          </div>
        )}
      </div>
    )}
  </PublishedNftStory>
)

const meta = {
  title: 'Features/Dashboard/Commemorative NFT',
  component: DashboardPreview,
  parameters: { layout: 'fullscreen' },
  args: { ownerAddress: publishedNftStoryOwner },
} satisfies Meta<typeof DashboardPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Desktop: Story = {}

export const Mobile: Story = {
  render: () => (
    <iframe
      className="mx-auto block h-[852px] w-[393px] max-w-full border-0"
      src="./iframe.html?id=features-dashboard-commemorative-nft--desktop&viewMode=story"
      title="Mobile commemorative NFT preview"
    />
  ),
}
