import { type UseQueryResult, useQuery } from '@tanstack/react-query'
import { type Address, zeroAddress } from 'viem'
import {
  getRecordEditLock,
  type RecordEditLock,
} from '@/features/records/helpers/recordEditLock'
import { getWrapperDataQueryOptions } from '@/features/resolver/hooks/useWrapperData'
import { getCanWriteRecordsOnResolverQueryOptions } from '@/features/resolver/queries/getCanWriteRecordsOnResolver'

type UseRecordEditLockParams = {
  readonly name: string
  /** Only the ownership fallback can be locked, so callers scope these reads to it. */
  readonly enabled: boolean
  readonly resolverAddress: Address | null | undefined
  readonly account: Address | undefined
}

type UseRecordEditLockReturn = {
  readonly editLock: RecordEditLock | undefined
  /** Folded into the caller's loading and error state. */
  readonly queries: readonly UseQueryResult<unknown>[]
}

/** Whether burnt fuses leave a wrapped name's owner no way onto a resolver that takes their writes. */
export const useRecordEditLock = ({
  name,
  enabled,
  resolverAddress,
  account,
}: UseRecordEditLockParams): UseRecordEditLockReturn => {
  const wrapperDataQuery = useQuery({
    ...getWrapperDataQueryOptions({ name }),
    enabled,
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
    enabled: enabled && isRecoveryFused && !!resolverAddress && !!account,
  })

  return {
    editLock: getRecordEditLock({
      fuses,
      canWriteOnResolver: canWriteQuery.data,
    }),
    queries: [wrapperDataQuery, canWriteQuery],
  }
}
