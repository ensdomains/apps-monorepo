import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { type Address, formatEther, type PublicClient } from 'viem'
import { usePublicClient } from 'wagmi'
import type { RenewableGraceName } from '@/features/migration/service/classifyNames'
import { estimateLegacyGraceRenewals } from '@/features/migration/service/legacyGraceRenewal'
import { useSmartAccountContext } from '@/lib/smart-account'

export type LegacyGraceRenewalEstimateState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready'
      readonly formattedGasEth: string
      readonly formattedRenewalEth: string
      readonly gasFeeWei: bigint
      readonly renewalCostWei: bigint
      readonly transactionCount: number
    }
  | { readonly status: 'error' }

const formatEstimatedEth = (wei: bigint): string => {
  const formatted = formatEther(wei)
  const [whole = '0', fraction = ''] = formatted.split('.')
  const trimmedFraction = fraction.slice(0, 6).replace(/0+$/, '')
  return trimmedFraction.length > 0 ? `${whole}.${trimmedFraction}` : whole
}

export const useLegacyGraceRenewalEstimate = (
  names: readonly RenewableGraceName[],
): LegacyGraceRenewalEstimateState => {
  const publicClient = usePublicClient()
  const { ownerAddress } = useSmartAccountContext()
  const renewalKey = useMemo(
    () =>
      names
        .map((name) => `${name.domain.id}:${name.renewalDurationSeconds}`)
        .sort()
        .join(','),
    [names],
  )

  const enabled = !!ownerAddress && !!publicClient && names.length > 0
  const query = useQuery({
    queryKey: [
      'legacy-grace-renewal-estimate',
      ownerAddress?.toLowerCase() ?? '',
      renewalKey,
    ] as const,
    enabled,
    staleTime: 15_000,
    queryFn: () => {
      if (!ownerAddress || !publicClient) {
        throw new Error('Cannot estimate renewal without a wallet')
      }
      return estimateLegacyGraceRenewals({
        names,
        accountAddress: ownerAddress as Address,
        publicClient: publicClient as unknown as PublicClient,
      })
    },
  })

  if (!enabled) return { status: 'idle' }
  if (query.isPending) return { status: 'loading' }
  if (query.isError || !query.data) return { status: 'error' }

  return {
    status: 'ready',
    formattedGasEth: formatEstimatedEth(query.data.gasFeeWei),
    formattedRenewalEth: formatEstimatedEth(query.data.renewalCostWei),
    gasFeeWei: query.data.gasFeeWei,
    renewalCostWei: query.data.renewalCostWei,
    transactionCount: query.data.transactionCount,
  }
}
