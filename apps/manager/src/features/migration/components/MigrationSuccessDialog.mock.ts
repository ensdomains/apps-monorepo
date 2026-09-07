import { sepolia } from 'viem/chains'
import { buildCommemorativeNftCardData } from '../commemorative-nft/cardData'
import type { CommemorativeNftEligibility } from '../commemorative-nft/types'
import type {
  CommemorativeNftCardData,
  MigrationSuccessDialogState,
} from './success/MigrationSuccessDialog.types'

const mockOwnerAddress = '0x0000000000000000000000000000000000000001'

export const createMigrationSuccessDialogMockCard = ({
  minted = false,
  rendererName = 'nick',
}: {
  readonly minted?: boolean
  readonly rendererName?: string
} = {}): CommemorativeNftCardData => {
  const profileName = `${rendererName}.eth`
  const eligibility: CommemorativeNftEligibility = {
    ownerAddress: mockOwnerAddress,
    profileName,
    rendererName,
    proof: [],
    traits: {
      Era: 'Founding',
      Depth: 'Collector',
      Gasveteran: 'Seasoned',
      Archetype: 'Personal',
      Rarity: 'Common',
      Seed: 742_941_409,
    },
    // The preview uses the live renderer; no downloadable WebP is published
    // for this display-only fixture.
    assets: {
      externalUrl: `https://app.ens.domains/p/${profileName}`,
    },
    source: 'preview',
  }

  return buildCommemorativeNftCardData({
    chainId: sepolia.id,
    eligibility,
    migratedAt: new Date('2026-09-07T09:00:00Z'),
    migratedNameCount: 2,
    minted,
    ownerAddress: mockOwnerAddress,
  })
}

const readyCard = createMigrationSuccessDialogMockCard()

export const migrationSuccessDialogMockStates = {
  loadingEligibility: { status: 'loadingEligibility' },
  revealing: { status: 'revealing', card: readyCard },
  artworkFailure: {
    status: 'revealing',
    card: {
      ...readyCard,
      artworkUrl: '/__nft-story-missing-image.webp',
      assets: { ...readyCard.assets, animationUrl: '' },
    },
  },
  readyToMint: { status: 'readyToMint', card: readyCard },
  minting: {
    status: 'minting',
    card: readyCard,
    txHash:
      '0x1111111111111111111111111111111111111111111111111111111111111111',
  },
  minted: {
    status: 'minted',
    card: createMigrationSuccessDialogMockCard({ minted: true }),
  },
  claimError: {
    status: 'error',
    stage: 'claim',
    message: 'The network could not confirm your mint. Please try again.',
    card: readyCard,
  },
  unavailable: {
    status: 'error',
    stage: 'configuration',
    message: 'The commemorative NFT preview is not available yet.',
  },
  ineligible: { status: 'ineligible' },
  longName: {
    status: 'readyToMint',
    card: createMigrationSuccessDialogMockCard({
      rendererName: 'a-very-long-name-for-a-commemorative-ensv2-nft-card',
    }),
  },
} satisfies Record<string, MigrationSuccessDialogState>
