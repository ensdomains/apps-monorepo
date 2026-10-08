import { formatGasEth } from '@ens-apps/utils/formatGasEth'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { hashKey, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { Address, PublicClient } from 'viem'
import { useConfig } from 'wagmi'
import type { MigrationWalletRequestDescriptor } from '../service/buildStepDescriptors'
import {
  estimateGraceRenewalMigrationGas,
  type GraceRenewalMigrationGasEstimate,
} from '../service/estimateGraceRenewalMigrationGas'
import { migrationPreparationFailure } from '../service/migrationPreparationError'
import type { V1Domain } from '../service/v1SubgraphClient'
import type { GraceRenewalQuoteState } from './useGraceRenewalQuote'
import type { MigrationGasEstimateState } from './useMigrationGasEstimate'

export type GraceRenewalGasEstimateState =
  | Exclude<MigrationGasEstimateState, { readonly status: 'ready' }>
  | (Omit<
      Extract<MigrationGasEstimateState, { readonly status: 'ready' }>,
      'plan'
    > & {
      readonly stepDescriptors: readonly MigrationWalletRequestDescriptor[]
    })

const graceRenewalGasEstimateQueryKey = createQueryKey<
  'migration-grace-gas-estimate',
  {
    readonly estimateIdentity: {
      readonly chainId: number | undefined
      readonly ownerAddress: string | undefined
      readonly hcaAddress: string | undefined
      readonly selectedNames: readonly string[]
      readonly managerRestorationNames: readonly string[]
      readonly domains: readonly V1Domain[]
      readonly renewal:
        | {
            readonly chainId: number
            readonly paymentToken: string
            readonly renewerAddress: string
            readonly items: readonly {
              readonly domain: V1Domain
              readonly label: string
              readonly hasRenewal: boolean
            }[]
          }
        | undefined
    }
    readonly quote: {
      readonly quotedAtMs: number | undefined
      readonly expiresAt: string | undefined
      readonly totalAmount: string | undefined
      readonly items:
        | readonly {
            readonly duration: string
            readonly targetExpiry: string
            readonly registrationExpiry: string
            readonly amount: string
          }[]
        | undefined
    }
  }
>('migration-grace-gas-estimate')

export const useGraceRenewalGasEstimate = ({
  renewal,
  selectedNames,
  managerRestorationNames = [],
  v1Names,
  hcaAddress,
  publicClient,
  isEnabled,
}: {
  readonly renewal: GraceRenewalQuoteState
  readonly selectedNames: readonly string[]
  readonly managerRestorationNames?: readonly string[]
  readonly v1Names: readonly V1Domain[]
  readonly hcaAddress: Address | undefined
  readonly publicClient: PublicClient
  readonly isEnabled: boolean
}): GraceRenewalGasEstimateState => {
  const wagmiConfig = useConfig()
  const quote = renewal.status === 'ready' ? renewal.quote : undefined
  const domains = useMemo(() => {
    const selected = new Set(selectedNames)
    return v1Names.filter(({ name }) => selected.has(name))
  }, [selectedNames, v1Names])
  const estimateIdentity = {
    chainId: publicClient.chain?.id,
    ownerAddress: quote?.ownerAddress.toLowerCase(),
    hcaAddress: hcaAddress?.toLowerCase(),
    selectedNames: [...selectedNames].sort(),
    managerRestorationNames: [...managerRestorationNames].sort(),
    domains,
    renewal: quote && {
      chainId: quote.chainId,
      paymentToken: quote.paymentToken.toLowerCase(),
      renewerAddress: quote.renewerAddress.toLowerCase(),
      items: quote.items.map(({ domain, label, duration }) => ({
        domain,
        label,
        hasRenewal: duration > 0n,
      })),
    },
  }
  const query = useQuery<
    GraceRenewalMigrationGasEstimate,
    Error,
    GraceRenewalMigrationGasEstimate,
    ReturnType<typeof graceRenewalGasEstimateQueryKey>
  >({
    queryKey: graceRenewalGasEstimateQueryKey({
      estimateIdentity,
      quote: {
        quotedAtMs: quote?.quotedAtMs,
        expiresAt: quote?.expiresAt.toString(),
        totalAmount: quote?.totalAmount.toString(),
        items: quote?.items.map((item) => ({
          duration: item.duration.toString(),
          targetExpiry: item.targetExpiry.toString(),
          registrationExpiry: item.registrationExpiry.toString(),
          amount: item.amount.toString(),
        })),
      },
    }),
    // Keep the requests dialog open while this selection's quote refreshes.
    // Prices and durations may drift; another wallet, selection, or renewal
    // route must never inherit the previous estimate or request descriptors.
    placeholderData: (previousData, previousQuery) =>
      previousQuery &&
      hashKey([previousQuery.queryKey[1].estimateIdentity]) ===
        hashKey([estimateIdentity])
        ? previousData
        : undefined,
    enabled: isEnabled && !!quote && !!hcaAddress && selectedNames.length > 0,
    staleTime: 30_000,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }): Promise<GraceRenewalMigrationGasEstimate> => {
      if (!quote || !hcaAddress || domains.length !== selectedNames.length) {
        throw new Error(
          'Could not estimate the network fee for every selected name.',
        )
      }
      return estimateGraceRenewalMigrationGas({
        quote,
        domains,
        hcaAddress,
        publicClient,
        wagmiConfig,
        managerRestorationNames,
        signal,
      })
    },
  })

  if (!isEnabled || renewal.status === 'idle' || renewal.status === 'error') {
    return { status: 'idle' }
  }
  if (!quote || !hcaAddress) {
    return { status: 'loading' }
  }
  if (query.isError) {
    return {
      status: 'error',
      ...migrationPreparationFailure(query.error, 'fee'),
    }
  }
  if (!query.data) return { status: 'loading' }
  return {
    status: 'ready',
    ...query.data,
    formattedEth: formatGasEth(query.data.feeWei),
  }
}
