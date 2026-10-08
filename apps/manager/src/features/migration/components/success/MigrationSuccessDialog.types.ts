import type { Hex } from 'viem'
import type {
  CommemorativeNftAssets,
  CommemorativeNftEligibility,
  CommemorativeNftShareUrls,
} from '../../commemorative-nft/types'

export type CommemorativeNftCardData = {
  readonly assets: CommemorativeNftAssets
  readonly eligibility: CommemorativeNftEligibility
  readonly learnMoreUrl?: string
  readonly marketplaceUrl?: string
  readonly shareUrls: CommemorativeNftShareUrls
}

export type MigrationSuccessDialogState =
  | { readonly status: 'loadingEligibility' }
  | { readonly status: 'ineligible' }
  | { readonly status: 'readyToMint'; readonly card: CommemorativeNftCardData }
  | {
      readonly status: 'minting'
      readonly card: CommemorativeNftCardData
      readonly txHash?: Hex
    }
  | { readonly status: 'minted'; readonly card: CommemorativeNftCardData }
  | {
      readonly status: 'claimPending'
      readonly card?: CommemorativeNftCardData
      readonly txHash: Hex
      readonly checking: boolean
      readonly message: string
    }
  | {
      readonly status: 'error'
      readonly stage: 'configuration' | 'eligibility' | 'claim'
      readonly message: string
      readonly card?: CommemorativeNftCardData
    }
