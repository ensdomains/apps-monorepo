import { CommemorativeNftClaimError } from './contract'
import type { PendingNftClaimScope } from './pendingClaim'

/** Hold one browser-wide lease through preflight, wallet submission and saving. */
export const withNftClaimSubmissionLock = async <T>(
  scope: PendingNftClaimScope,
  submit: () => Promise<T>,
): Promise<T> => {
  const locks = globalThis.navigator?.locks
  if (!locks)
    throw new CommemorativeNftClaimError(
      'browser-unsupported',
      'Cross-tab claim coordination is unavailable',
    )
  const name = `ens:nft-claim:${scope.chainId}:${scope.contractAddress.toLowerCase()}:${scope.ownerAddress.toLowerCase()}`
  return locks.request(
    name,
    { mode: 'exclusive', ifAvailable: true },
    async (lock) => {
      if (!lock)
        throw new CommemorativeNftClaimError(
          'claim-in-progress',
          'Another tab is preparing this claim',
        )
      return submit()
    },
  )
}
