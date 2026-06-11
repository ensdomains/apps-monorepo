import { useQuery } from '@tanstack/react-query'
import { useRef } from 'react'
import { type Address, formatEther, type PublicClient } from 'viem'
import { useConfig, usePublicClient } from 'wagmi'
import {
  buildMigrationPlan,
  type MigrationPlan,
} from '@/features/migration/service/buildMigrationPlan'
import { estimateMigrationGasCost } from '@/features/migration/service/estimateMigrationGasCost'
import type { V1Domain } from '@/features/migration/service/v1SubgraphClient'
import { useMigrationPreflight } from './useMigrationPreflight'

export type MigrationGasEstimateState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready'
      readonly formattedEth: string
      readonly gasUnits: bigint
      readonly feeWei: bigint
      readonly transactionCount: number
      readonly plan: MigrationPlan
    }
  | { readonly status: 'error' }

type UseMigrationGasEstimateParams = {
  readonly ownerAddress: Address | undefined
  readonly selectedNames: readonly string[]
  readonly v1Names: readonly V1Domain[]
}

const selectDomainsFromNames = (
  v1Names: readonly V1Domain[],
  selectedNames: readonly string[],
): V1Domain[] => {
  const selected = new Set(selectedNames)
  return v1Names.filter((domain) => selected.has(domain.name))
}

const formatEstimatedEth = (wei: bigint): string => {
  const formatted = formatEther(wei)
  const [whole = '0', fraction = ''] = formatted.split('.')
  const trimmedFraction = fraction.slice(0, 6).replace(/0+$/, '')
  return trimmedFraction.length > 0 ? `${whole}.${trimmedFraction}` : whole
}

export const useMigrationGasEstimate = ({
  ownerAddress,
  selectedNames,
  v1Names,
}: UseMigrationGasEstimateParams): MigrationGasEstimateState => {
  const publicClient = usePublicClient()
  const wagmiConfig = useConfig()
  const { ensure: ensurePreflight } = useMigrationPreflight({
    eoa: ownerAddress,
  })

  const domains = selectDomainsFromNames(v1Names, selectedNames)
  const domainIds = domains
    .map((domain) => domain.id)
    .sort()
    .join(',')
  const selectionRevisionRef = useRef({ domainIds: '', revision: 0 })
  if (selectionRevisionRef.current.domainIds !== domainIds) {
    selectionRevisionRef.current = {
      domainIds,
      revision: selectionRevisionRef.current.revision + 1,
    }
  }
  const enabled =
    !!ownerAddress &&
    !!publicClient &&
    selectedNames.length > 0 &&
    domains.length > 0

  const query = useQuery({
    queryKey: [
      'migration-gas-estimate',
      ownerAddress?.toLowerCase() ?? '',
      domainIds,
      selectionRevisionRef.current.revision,
    ] as const,
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      if (!ownerAddress || !publicClient) {
        throw new Error('Cannot estimate migration gas without a wallet')
      }
      const preflight = await ensurePreflight(domains)
      const plan = await buildMigrationPlan({
        domains,
        migrationOwner: ownerAddress,
        wagmiConfig,
        publicClient: publicClient as unknown as PublicClient,
        preflight,
        hasBaseRegistrarApproval: preflight.baseRegistrarApproved,
        hasNameWrapperApproval: preflight.nameWrapperApproved,
      })
      const estimate = await estimateMigrationGasCost({
        plan,
        publicClient: publicClient as unknown as PublicClient,
        account: ownerAddress,
      })
      return { estimate, plan }
    },
  })

  if (!enabled) return { status: 'idle' }
  if (query.isPending) return { status: 'loading' }
  if (query.isError || query.data?.estimate.status === 'error')
    return { status: 'error' }
  if (!query.data) return { status: 'idle' }

  return {
    status: 'ready',
    formattedEth: formatEstimatedEth(query.data.estimate.feeWei),
    gasUnits: query.data.estimate.gasUnits,
    feeWei: query.data.estimate.feeWei,
    transactionCount: query.data.estimate.transactionCount,
    plan: query.data.plan,
  }
}
