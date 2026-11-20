import { useQuery } from '@tanstack/react-query'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { getPrimaryNameQueryOptions } from '@/features/profile/hooks/usePrimaryName'
import { getNameResolverAddressQueryOptions } from '@/features/records/hooks/useNameResolverAddress'
import { getEthAddressQueryOptions } from '@/features/transfer/queries/getEthAddress'
import type { PaletteEntity } from './core/types'
import {
  PALETTE_AVAILABILITY_STALE_TIME_MS,
  PALETTE_RELATIONSHIP_STALE_TIME_MS,
} from './queryPolicy'
import {
  getRelationshipPresentation,
  getRelationshipReadState,
  getRelationshipRegistrationName,
} from './relatedEntities'

export const usePaletteRelatedEntities = (
  entity: PaletteEntity | undefined,
  isEnabled: boolean,
) => {
  const name = entity?.type === 'name' ? entity.name : ''
  const address = entity?.type === 'address' ? entity.address : undefined
  const registrationName = getRelationshipRegistrationName(entity)
  const availability = useQuery({
    ...getNameAvailabilityQueryOptions({ name: registrationName ?? '' }),
    enabled: isEnabled && Boolean(registrationName),
    staleTime: PALETTE_AVAILABILITY_STALE_TIME_MS,
  })
  const state = getRelationshipReadState({ entity, isEnabled, availability })
  const canReadName = state === 'ready' && entity?.type === 'name'
  const owner = useQuery({
    ...getEnsOwnerQueryOptions({ name }),
    enabled: canReadName,
    staleTime: PALETTE_RELATIONSHIP_STALE_TIME_MS,
  })
  const ethAddress = useQuery({
    ...getEthAddressQueryOptions({ name }),
    enabled: canReadName,
    staleTime: PALETTE_RELATIONSHIP_STALE_TIME_MS,
  })
  const resolver = useQuery({
    ...getNameResolverAddressQueryOptions({ name }),
    enabled: canReadName,
    staleTime: PALETTE_RELATIONSHIP_STALE_TIME_MS,
  })
  const primaryName = useQuery({
    ...getPrimaryNameQueryOptions(address),
    enabled: isEnabled && Boolean(address),
    staleTime: PALETTE_RELATIONSHIP_STALE_TIME_MS,
  })
  const reads = { availability, owner, ethAddress, resolver, primaryName }
  const presentation = getRelationshipPresentation({
    entity,
    state,
    isEnabled,
    reads,
  })
  return {
    ...presentation,
    retry: () =>
      Promise.all(
        presentation.failedSources.map((source) => reads[source].refetch()),
      ),
  }
}
