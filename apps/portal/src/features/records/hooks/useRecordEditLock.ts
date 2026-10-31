import { type UseQueryResult, useQuery } from '@tanstack/react-query'
import { type Address, zeroAddress } from 'viem'
import {
  getRecordEditLock,
  type RecordEditLock,
} from '@/features/records/helpers/recordEditLock'
import { getWrapperDataQueryOptions } from '@/features/resolver/hooks/useWrapperData'
import { getCanWriteRecordsOnResolverQueryOptions } from '@/features/resolver/queries/getCanWriteRecordsOnResolver'
import { getResolverHasCodeQueryOptions } from '@/features/resolver/queries/getResolverHasCode'

type UseRecordEditLockParams = {
  readonly name: string
  readonly enabled: boolean
  /** Only the ownership fallback can be fuse-locked, so callers scope the fuse reads to it. */
  readonly isOwnershipFallback: boolean
  readonly resolverAddress: Address | null | undefined
  readonly account: Address | undefined
}

type UseRecordEditLockReturn = {
  readonly editLock: RecordEditLock | undefined
  /** Folded into the caller's loading and error state. */
  readonly queries: readonly UseQueryResult<unknown>[]
}

/**
 * Whether the resolver cannot take record writes from anyone (it is not a
 * contract), or burnt fuses leave a wrapped name's owner no way onto a
 * resolver that takes their writes.
 */
export const useRecordEditLock = ({
  name,
  enabled,
  isOwnershipFallback,
  resolverAddress,
  account,
}: UseRecordEditLockParams): UseRecordEditLockReturn => {
  const hasCodeQuery = useQuery({
    ...getResolverHasCodeQueryOptions({
      resolverAddress: resolverAddress ?? zeroAddress,
    }),
    enabled: enabled && !!resolverAddress,
  })

  const wrapperDataQuery = useQuery({
    ...getWrapperDataQueryOptions({ name }),
    enabled: enabled && isOwnershipFallback,
  })

  const childFuses = wrapperDataQuery.data?.fuses?.child
  const fuses = childFuses && {
    cannotSetResolver: childFuses.CANNOT_SET_RESOLVER,
    cannotUnwrap: childFuses.CANNOT_UNWRAP,
  }

  // Only burnt fuses make a refusal permanent, so they gate the probe.
  const isRecoveryFused = !!fuses?.cannotSetResolver && fuses.cannotUnwrap

  const canWriteQuery = useQuery({
    ...getCanWriteRecordsOnResolverQueryOptions({
      resolverAddress: resolverAddress ?? zeroAddress,
      name,
      account: account ?? zeroAddress,
    }),
    enabled:
      enabled &&
      isOwnershipFallback &&
      isRecoveryFused &&
      !!resolverAddress &&
      !!account,
  })

  return {
    editLock: getRecordEditLock({
      hasResolverCode: hasCodeQuery.data,
      fuses,
      canWriteOnResolver: canWriteQuery.data,
    }),
    queries: [hasCodeQuery, wrapperDataQuery, canWriteQuery],
  }
}
