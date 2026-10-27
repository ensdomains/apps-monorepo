import type { NameDetail } from '@ens-apps/indexer/reads'
import { hasResolvedRecords } from '@ens-apps/utils/hasResolvedRecords'
import { useQuery } from '@tanstack/react-query'
import { dnsSecEnabledQuery } from '@/features/profile/service/dnsSecEnabled'
import { profileOwnerQuery } from '@/features/profile/service/profileOwner'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { getSearchNameQueryOptions } from '@/features/shared/service/checkNameAvailabilityService'
import { getNameDetailQueryOptions } from '@/features/shared/service/nameDetail'
import { classifyNameSearch } from './classifyNameSearch'
import { getSearchNameKind } from './getSearchNameKind'
import type {
  AvailabilitySignal,
  ExistenceSignal,
  NameSearchOutcome,
  SearchNameKind,
  TldSupportSignal,
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

/**
 * An offchain (CCIP-Read) name has no owner or index entry, so a name both
 * call unowned exists when its records resolve.
 */
export const withResolvedRecords = (
  existence: ExistenceSignal,
  records: {
    readonly isPending: boolean
    readonly isError: boolean
    readonly hasRecords: boolean
  },
): ExistenceSignal => {
  if (existence.status !== 'unowned') return existence
  if (records.hasRecords) return { status: 'owned' }
  if (records.isPending) return { status: 'pending' }
  if (records.isError) return { status: 'unknown' }
  return existence
}

export const toTldSupportSignal = ({
  isEnabled,
  isError,
  isDnsSecEnabled,
}: {
  readonly isEnabled: boolean
  readonly isError: boolean
  readonly isDnsSecEnabled: boolean | undefined
}): TldSupportSignal => {
  if (!isEnabled) return { status: 'skipped' }
  if (isError) return { status: 'error' }
  if (isDnsSecEnabled === undefined) return { status: 'pending' }
  return isDnsSecEnabled ? { status: 'supported' } : { status: 'unsupported' }
}

/**
 * Whether the index says the name is held. Unsupported names count as held:
 * bigname knows them but cannot serve their fields.
 */
export const isHeldInIndex = (detail: NameDetail | null | undefined): boolean =>
  detail != null && detail.registrationStatus !== 'unregistered'

const getTld = (name: string) => name.slice(name.lastIndexOf('.') + 1)

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
    ...getNameDetailQueryOptions(isProfileName ? name : undefined),
    enabled: isProfileName,
  })

  const registryExistence = toExistenceSignal({
    isProfileName,
    ownerPending: ownerQuery.data === undefined && !ownerQuery.isError,
    ownerError: ownerQuery.isError,
    hasOwner: Boolean(ownerQuery.data?.owner),
    indexerPending: indexerQuery.data === undefined && !indexerQuery.isError,
    indexerError: indexerQuery.isError,
    indexerHit: isHeldInIndex(indexerQuery.data),
  })

  const recordsQuery = useQuery({
    ...profileRecordsQuery(name),
    enabled: registryExistence.status === 'unowned',
  })

  const existence = withResolvedRecords(registryExistence, {
    isPending: recordsQuery.isPending,
    isError: recordsQuery.isError,
    hasRecords: hasResolvedRecords(recordsQuery.data),
  })

  // TLD support only decides between not-imported and not-found, so skip the
  // DNSSEC lookup until a DNS 2LD is known to be unowned
  const needsTldSupport =
    kind.type === 'dns-name' &&
    !kind.isSubname &&
    existence.status === 'unowned'

  const dnsSecQuery = useQuery({
    ...dnsSecEnabledQuery(getTld(kind.name)),
    enabled: needsTldSupport,
  })

  const outcome = classifyNameSearch({
    kind,
    availability: toAvailabilitySignal({
      isEth2ld,
      isError: availabilityQuery.isError,
      isAvailable: availabilityQuery.data?.isAvailable,
    }),
    existence,
    tldSupport: toTldSupportSignal({
      isEnabled: needsTldSupport,
      isError: dnsSecQuery.isError,
      isDnsSecEnabled: dnsSecQuery.data,
    }),
  })

  return { kind, outcome }
}
