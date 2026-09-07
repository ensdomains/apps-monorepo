import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { useChainId, useConfig } from 'wagmi'
import { getCommemorativeNftContractAddress } from './config'
import { isCommemorativeNftClaimResultFresh } from './flowState'
import {
  commemorativeNftClaimedQueryOptions,
  commemorativeNftEligibilityQueryOptions,
} from './queries'

export const useCommemorativeNftAvailability = (params: {
  readonly ownerAddress: Address | undefined
  readonly enabled: boolean
  readonly pollClaimed?: boolean
}) => {
  const chainId = useChainId()
  const wagmiConfig = useConfig()
  const supported = !!getCommemorativeNftContractAddress(chainId)
  const ownerAddress = params.ownerAddress
  const enabled = params.enabled && supported && !!ownerAddress

  const eligibility = useQuery({
    ...commemorativeNftEligibilityQueryOptions({
      ownerAddress:
        ownerAddress ?? '0x0000000000000000000000000000000000000000',
    }),
    enabled,
  })
  const claimed = useQuery({
    ...commemorativeNftClaimedQueryOptions({
      ownerAddress:
        ownerAddress ?? '0x0000000000000000000000000000000000000000',
      chainId,
      wagmiConfig,
      poll: params.pollClaimed,
    }),
    enabled,
  })
  const hasFreshClaimedResult =
    enabled &&
    isCommemorativeNftClaimResultFresh({
      isFetchedAfterMount: claimed.isFetchedAfterMount,
      isSuccess: claimed.isSuccess,
      fetchStatus: claimed.fetchStatus,
    })
  const hasFreshEligibilityResult =
    enabled &&
    eligibility.isFetchedAfterMount &&
    eligibility.isSuccess &&
    eligibility.fetchStatus === 'idle'

  return {
    chainId,
    supported,
    eligibility,
    claimed,
    hasFreshEligibilityResult,
    hasFreshClaimedResult,
    isConfirmedUnclaimed: hasFreshClaimedResult && claimed.data === false,
  }
}
