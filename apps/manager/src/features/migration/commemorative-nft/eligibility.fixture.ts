import { type Address, zeroAddress } from 'viem'
import type { CommemorativeNftEligibility } from './types'

export const createCommemorativeNftPreviewEligibility = (params: {
  readonly ownerAddress?: Address
  readonly profileName?: string
}): CommemorativeNftEligibility => {
  const profileName = params.profileName?.trim() || 'preview.eth'

  return {
    ownerAddress: params.ownerAddress ?? zeroAddress,
    profileName,
    rendererName: profileName.replace(/\.eth$/i, ''),
    proof: [],
    traits: {
      Era: 'Founding',
      Depth: 'Collector',
      Gasveteran: 'Seasoned',
      Archetype: 'Personal',
      Rarity: 'Common',
      Seed: 742_941_409,
    },
    assets: {},
    source: 'preview',
  }
}
