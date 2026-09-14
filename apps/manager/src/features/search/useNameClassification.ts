import { Domain_OrderBy, OrderDirection } from '@ens-apps/indexer'
import { useQuery } from '@tanstack/react-query'
import { getDomainsQuery } from '@/features/dashboard/service/queries/getDashboardDomains'
import { profileOwnerQuery } from '@/features/profile/service/profileOwner'
import { getSearchNameQueryOptions } from '@/features/shared/service/checkNameAvailabilityService'
import { classifyNameSearch } from './classifyNameSearch'
import { getSearchNameKind } from './getSearchNameKind'
import type {
  AvailabilitySignal,
  ExistenceSignal,
  NameSearchOutcome,
  SearchNameKind,
} from './search.types'

export type NameClassification = {
  readonly kind: SearchNameKind
  readonly outcome: NameSearchOutcome
}

const toAvailabilitySignal = ({
  isEth2ld,
  isError,
  isAvailable,
}: {
  readonly isEth2ld: boolean
  readonly isError: boolean
  readonly isAvailable: boolean | undefined
}): AvailabilitySignal => {
  if (!isEth2ld) return { status: 'skipped' }
  if (isError) return { status: 'error' }
  if (isAvailable === undefined) return { status: 'pending' }
  return isAvailable ? { status: 'available' } : { status: 'unavailable' }
}

export const toExistenceSignal = ({
  isProfileName,
  ownerPending,
  ownerError,
  hasOwner,
  indexerPending,
  indexerError,
  indexerHit,
}: {
  readonly isProfileName: boolean
  readonly ownerPending: boolean
  readonly ownerError: boolean
  readonly hasOwner: boolean
  readonly indexerPending: boolean
  readonly indexerError: boolean
  readonly indexerHit: boolean
}): ExistenceSignal => {
  if (!isProfileName) return { status: 'unowned' }

  // Query errors can retain the previous successful data. Only trust a
  // positive result from a source whose current request succeeded.
  if ((hasOwner && !ownerError) || (indexerHit && !indexerError)) {
    return { status: 'owned' }
  }
  if (ownerPending || indexerPending) return { status: 'pending' }
  if (ownerError || indexerError) return { status: 'unknown' }
  return { status: 'unowned' }
}

export const useNameClassification = (name: string): NameClassification => {
  const kind = getSearchNameKind(name)
  const isEth2ld = kind.type === 'eth-2ld'
  const isProfileName = kind.type === 'eth-subname' || kind.type === 'dns-name'

  const availabilityQuery = useQuery({
    ...getSearchNameQueryOptions(name),
    enabled: isEth2ld,
  })

  const ownerQuery = useQuery({
    ...profileOwnerQuery(name),
    enabled: isProfileName,
  })

  const indexerQuery = useQuery({
    ...getDomainsQuery(
      isProfileName
        ? {
            where: { name },
            first: 1,
            orderBy: Domain_OrderBy.Name,
            orderDirection: OrderDirection.Asc,
          }
        : undefined,
    ),
    enabled: isProfileName,
  })

  const outcome = classifyNameSearch({
    kind,
    availability: toAvailabilitySignal({
      isEth2ld,
      isError: availabilityQuery.isError,
      isAvailable: availabilityQuery.data?.isAvailable,
    }),
    existence: toExistenceSignal({
      isProfileName,
      ownerPending: ownerQuery.data === undefined && !ownerQuery.isError,
      ownerError: ownerQuery.isError,
      hasOwner: Boolean(ownerQuery.data?.owner),
      indexerPending: indexerQuery.data === undefined && !indexerQuery.isError,
      indexerError: indexerQuery.isError,
      indexerHit: (indexerQuery.data?.domains.length ?? 0) > 0,
    }),
  })

  return { kind, outcome }
}
