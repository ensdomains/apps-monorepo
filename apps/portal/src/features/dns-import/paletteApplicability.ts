import type { PaletteTargetMetadata } from '@/features/command-palette/core/types'
import { isNameTargetNotKnownAvailable } from '@/features/profile/paletteApplicability'
import { isClaimable } from '@/utils/ens/tldHelpers'

export const canShowDnsImport = (target: PaletteTargetMetadata): boolean =>
  isNameTargetNotKnownAvailable(target) && isClaimable(target.entity.name)
