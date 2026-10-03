import { useMemo, useSyncExternalStore } from 'react'
import type { Address } from 'viem'
import { getCommemorativeNftContractAddress } from './config'
import {
  type PendingNftClaimSnapshot,
  pendingNftClaimRevision,
  readPendingNftClaim,
  subscribePendingNftClaims,
} from './pendingClaim'

/** Observe scoped recovery data without starting a receipt poll. */
export const usePendingCommemorativeNftClaim = (params: {
  readonly ownerAddress: Address | undefined
  readonly chainId: number
  readonly contractAddress?: Address
}): PendingNftClaimSnapshot => {
  const revision = useSyncExternalStore(
    subscribePendingNftClaims,
    pendingNftClaimRevision,
    () => 0,
  )
  const contractAddress =
    params.contractAddress ?? getCommemorativeNftContractAddress()
  return useMemo(() => {
    void revision
    return params.ownerAddress && contractAddress
      ? readPendingNftClaim({
          ownerAddress: params.ownerAddress,
          chainId: params.chainId,
          contractAddress,
        })
      : { status: 'empty' }
  }, [params.ownerAddress, params.chainId, contractAddress, revision])
}
