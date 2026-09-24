import type { Address } from 'viem'
import type { CommemorativeNftCardData } from '../components/success/MigrationSuccessDialog.types'
import { getCommemorativeNftConfig } from './config'
import {
  buildCommemorativeNftMarketplaceUrl,
  buildCommemorativeNftPublicUrl,
  buildCommemorativeNftShareUrls,
} from './sharing'
import type { CommemorativeNftEligibility } from './types'

export const buildCommemorativeNftCardData = (params: {
  readonly chainId: number
  readonly eligibility: CommemorativeNftEligibility
  readonly minted: boolean
  readonly ownerAddress: Address
}): CommemorativeNftCardData => {
  const shareTarget = buildCommemorativeNftPublicUrl({
    ownerAddress: params.eligibility.ownerAddress,
    rendererOrigin: getCommemorativeNftConfig().rendererOrigin,
  })

  return {
    assets: params.eligibility.assets,
    eligibility: params.eligibility,
    marketplaceUrl: params.minted
      ? buildCommemorativeNftMarketplaceUrl({
          chainId: params.chainId,
          ownerAddress: params.ownerAddress,
        })
      : undefined,
    shareUrls: buildCommemorativeNftShareUrls(
      shareTarget,
      params.minted,
      params.eligibility.traits,
    ),
  }
}
