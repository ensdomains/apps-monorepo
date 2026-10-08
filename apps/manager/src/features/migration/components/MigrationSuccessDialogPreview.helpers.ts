import type { UseQueryResult } from '@tanstack/react-query'
import type { Address } from 'viem'
import { buildCommemorativeNftCardData } from '../commemorative-nft/cardData'
import type { CommemorativeNftEligibilityResult } from '../commemorative-nft/types'
import type { MigrationSuccessDialogState } from './success/MigrationSuccessDialog.types'

export type PublishedPreviewQuery = Pick<
  UseQueryResult<CommemorativeNftEligibilityResult>,
  | 'data'
  | 'error'
  | 'isPending'
  | 'isError'
  | 'fetchStatus'
  | 'isFetchedAfterMount'
>

export const getPublishedPreviewState = (params: {
  readonly ownerAddress?: Address
  readonly query?: PublishedPreviewQuery
}): MigrationSuccessDialogState => {
  if (!params.ownerAddress) {
    return {
      status: 'error',
      stage: 'configuration',
      message: 'Connect your owner wallet to preview its commemorative NFT.',
    }
  }

  const query = params.query
  if (query?.fetchStatus === 'paused') {
    return {
      status: 'error',
      stage: 'eligibility',
      message: 'Reconnect to the internet to load your published NFT.',
    }
  }
  if (query?.isError && query.fetchStatus === 'idle') {
    return {
      status: 'error',
      stage: 'eligibility',
      message:
        query.error?.message || 'Published NFT metadata could not be loaded.',
    }
  }
  if (
    !query ||
    query.isPending ||
    !query.isFetchedAfterMount ||
    query.fetchStatus === 'fetching'
  ) {
    return { status: 'loadingEligibility' }
  }

  if (query.data?.status === 'ineligible') return { status: 'ineligible' }
  if (query.data?.status === 'unavailable') {
    return {
      status: 'error',
      stage: 'eligibility',
      message: 'Published NFT metadata is not available. Please try again.',
    }
  }
  if (query.data?.status !== 'eligible') return { status: 'loadingEligibility' }

  const eligibility = query.data.eligibility
  if (
    eligibility.source !== 'static' ||
    eligibility.ownerAddress.toLowerCase() !== params.ownerAddress.toLowerCase()
  ) {
    return {
      status: 'error',
      stage: 'eligibility',
      message:
        'Published NFT metadata did not match your wallet. Please try again.',
    }
  }

  return {
    status: 'readyToMint',
    card: buildCommemorativeNftCardData({
      eligibility,
      minted: false,
      ownerAddress: params.ownerAddress,
    }),
  }
}
