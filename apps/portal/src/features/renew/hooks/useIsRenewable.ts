import { l2EthRegistrarIsRenewableSnippet } from '@ensdomains/ensjs/contracts'
import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { getLabel } from '@/utils/token/getLabel'
import { getRenewerAddress } from '../utils/renewer'

/**
 * Whether the renewer contract will actually renew this name right now, via its
 * on-chain `isRenewable(label)`. For unmigrated v1 names this is `ETHRenewerV1`,
 * which only renews RESERVED (premigrated) or in-grace names — so an active v1
 * name returns `false` and must not be offered an Extend action (calling
 * `getRenewPrice`/`renew` on it reverts `NameNotRenewable`).
 */
export const useIsRenewable = ({
  name,
  isV2,
  enabled = true,
}: {
  name: string
  isV2: boolean
  enabled?: boolean
}) => {
  const client = usePublicClient()

  return useQuery({
    queryKey: ['is-renewable', name, isV2],
    enabled: enabled && !!client && !!name,
    queryFn: async (): Promise<boolean> => {
      if (!client) return false
      let label: string
      try {
        label = getLabel(name)
      } catch {
        return false
      }
      try {
        return await client.readContract({
          address: getRenewerAddress(isV2),
          abi: l2EthRegistrarIsRenewableSnippet,
          functionName: 'isRenewable',
          args: [label],
        })
      } catch {
        // A revert here (e.g. name unknown to the renewer) means "not renewable".
        return false
      }
    },
  })
}
