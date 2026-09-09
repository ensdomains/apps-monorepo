import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import { buildCommemorativeNftCardData } from '../commemorative-nft/cardData'
import { commemorativeNftEligibilityQueryOptions } from '../commemorative-nft/queries'
import { getPublishedPreviewState } from './MigrationSuccessDialogPreview.helpers'
import type { MigrationSuccessDialogState } from './success/MigrationSuccessDialog.types'

// The wallet from the published token supplied for review. NFT data is fetched,
// never synthesized or substituted when the published assets are unavailable.
export const publishedNftStoryOwner =
  '0x03Ba34f6Ea1496fa316873CF8350A3f7eaD317EF' satisfies Address

export const PublishedNftStory = ({
  children,
  minted = false,
  ownerAddress,
}: {
  readonly children: (props: {
    readonly state: MigrationSuccessDialogState
    readonly retry: () => void
  }) => ReactNode
  readonly minted?: boolean
  readonly ownerAddress: Address
}) => {
  const [migratedAt] = useState(() => new Date())
  const query = useQuery(
    commemorativeNftEligibilityQueryOptions({ ownerAddress }),
  )
  const previewState = getPublishedPreviewState({
    ownerAddress,
    chainId: sepolia.id,
    migratedAt,
    query,
  })
  const state: MigrationSuccessDialogState =
    minted && previewState.status === 'readyToMint'
      ? {
          status: 'minted',
          card: buildCommemorativeNftCardData({
            chainId: sepolia.id,
            eligibility: previewState.card.eligibility,
            migratedAt,
            migratedNameCount: 0,
            minted: true,
            ownerAddress,
          }),
        }
      : previewState

  return children({ state, retry: () => void query.refetch() })
}
