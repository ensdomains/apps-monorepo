import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { profileExpiryQuery } from '@/features/profile/service/profileExpiry'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { ProfileActions } from './ProfileActions'

const NAME = 'example.eth'
const IN_A_YEAR = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60)

// Seeds the expiry read so Renew Name renders without RPC.
const withExpiry = (expiry: bigint) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  queryClient.setQueryData(profileExpiryQuery(NAME, 'v2').queryKey, {
    expiry,
    isNonExpiring: false,
    protocol: 'v2',
  })
  return queryClient
}

const meta = {
  title: 'Features/Profile/Profile actions',
  component: ProfileActions,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <QueryClientProvider client={withExpiry(IN_A_YEAR)}>
        <div className="min-h-[400px]">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
  args: {
    canEdit: false,
    hasDesktopBar: true,
    hasFloatingBar: false,
    isInGrace: false,
    isOwner: true,
    isUpgradeRequired: false,
    name: NAME,
    onUpdated: () => undefined,
    records: newEmptyProfileRecords(),
    renewalProtocol: 'v2',
    url: `https://app.ens.domains/p/${NAME}`,
  },
} satisfies Meta<typeof ProfileActions>

export default meta
type Story = StoryObj<typeof meta>

/** An owner who can't edit keeps the actions in the bottom bar at every width. */
export const OwnerWithoutEditAccess: Story = {}

export const OwnerWithoutEditAccessMobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}

/** A visitor's desktop actions sit in the header, so the bar is mobile-only. */
export const Visitor: Story = {
  args: { hasDesktopBar: false, isOwner: false },
}

/** While the viewer's bar is still unknown, desktop shows no actions. */
export const PlacementPending: Story = {
  args: { hasDesktopBar: false, isOwner: undefined },
}
