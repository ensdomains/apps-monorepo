import { sepolia } from 'viem/chains'
import { buildCommemorativeNftCardData } from '../commemorative-nft/cardData'
import type { CommemorativeNftEligibility } from '../commemorative-nft/types'

// Temporary display-only fixture from the uploaded 100-item review batch.
export const createUploadedNftPreviewCard = () => {
  const tokenUrl =
    'https://nft-assets.ens.dev/token/9230288596206359373355064634157567392420194512054224406118125270081395766653'
  const metadataUrl = `${tokenUrl}.json`
  const animationUrl = `https://ens-renderer.pages.dev/?tokenURI=${encodeURIComponent(metadataUrl)}&transparent=1`
  const eligibility: CommemorativeNftEligibility = {
    ownerAddress: '0x0000000000000000000000000000000000000001',
    profileName: 'karmacomboy.eth',
    rendererName: 'karmacomboy',
    proof: [],
    traits: {
      Era: 'NFT',
      Depth: 'Collector',
      Gasveteran: 'Battle-Scarred',
      Archetype: 'Abstract',
      Rarity: 'Common',
      Seed: 790_536_782,
    },
    assets: {
      metadataUrl,
      imageUrl: `${tokenUrl}.webp`,
      animationUrl,
      externalUrl: animationUrl,
    },
    source: 'preview',
  }

  return buildCommemorativeNftCardData({
    artworkUrl: eligibility.assets.imageUrl,
    chainId: sepolia.id,
    eligibility,
    migratedAt: new Date('2026-09-07T07:38:55Z'),
    migratedNameCount: 1,
    minted: false,
    ownerAddress: eligibility.ownerAddress,
  })
}
