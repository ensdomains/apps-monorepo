import { useQuery } from '@tanstack/react-query'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import type { PaletteEntity, PaletteTargetMetadata } from './core/types'

export const useCachedPaletteTarget = (
  entity?: PaletteEntity,
): PaletteTargetMetadata | undefined => {
  const name = entity?.type === 'name' ? entity.name : ''
  const owner = useQuery({
    ...getEnsOwnerQueryOptions({ name }),
    enabled: false,
  })
  const availability = useQuery({
    ...getNameAvailabilityQueryOptions({ name }),
    enabled: false,
  })
  if (!entity) return undefined
  return {
    entity,
    protocolVersion: owner.data?.protocolVersion,
    isAvailable: availability.data?.isAvailable,
  }
}
