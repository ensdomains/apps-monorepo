import { useQuery } from '@tanstack/react-query'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getPrimaryNameQueryOptions } from '@/features/profile/hooks/usePrimaryName'
import { getProfileQueryOptions } from '@/features/profile/hooks/useProfile'
import { getNameResolverAddressQueryOptions } from '@/features/records/hooks/useNameResolverAddress'
import { isCanonicalName } from '@/utils/token/isNormalized'
import type { PaletteEntity } from './core/types'
import {
  getRelatedEntities,
  type PaletteRelatedEntity,
} from './relatedEntities'

/** Reads the same owner, records, resolver and primary-name queries the entity pages use. */
export const usePaletteRelatedEntities = (
  entity: PaletteEntity | undefined,
  isEnabled: boolean,
): readonly PaletteRelatedEntity[] => {
  const name = entity?.type === 'name' ? entity.name : ''
  const address = entity?.type === 'address' ? entity.address : undefined
  // An unsafe spelling never reaches a lookup; its actions stop at the execution plan.
  const isNameEnabled = isEnabled && Boolean(name) && isCanonicalName(name)
  const owner = useQuery({
    ...getEnsOwnerQueryOptions({ name }),
    enabled: isNameEnabled,
  })
  const profile = useQuery({
    ...getProfileQueryOptions({ name }),
    enabled: isNameEnabled,
  })
  const resolver = useQuery({
    ...getNameResolverAddressQueryOptions({ name }),
    enabled: isNameEnabled,
  })
  const primaryName = useQuery({
    ...getPrimaryNameQueryOptions(address),
    enabled: isEnabled && Boolean(address),
  })
  if (!entity) return []
  return getRelatedEntities({
    entity,
    owner: owner.data?.owner,
    coins: profile.data?.records.coins,
    resolverAddress: resolver.data,
    primaryName: primaryName.data,
  })
}
