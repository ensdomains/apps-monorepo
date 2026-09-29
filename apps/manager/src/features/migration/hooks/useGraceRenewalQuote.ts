import { useQuery } from '@tanstack/react-query'
import type { Address, PublicClient } from 'viem'
import {
  type GraceRenewalQuote,
  getGraceRenewalQuote,
} from '../service/graceRenewal'
import type { V1Domain } from '../service/v1SubgraphClient'

export type GraceRenewalQuoteState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly quote: GraceRenewalQuote }

export const withRenewalAccountReadiness = (
  state: GraceRenewalQuoteState,
  ready: boolean,
  error: string | null | undefined,
): GraceRenewalQuoteState => {
  if (state.status === 'idle') return state
  if (error) return { status: 'error', message: error }
  if (!ready) return { status: 'loading' }
  return state
}

export const useGraceRenewalQuote = ({
  domains,
  ownerAddress,
  publicClient,
  enabled,
}: {
  readonly domains: readonly V1Domain[]
  readonly ownerAddress: Address | undefined
  readonly publicClient: PublicClient
  readonly enabled: boolean
}): GraceRenewalQuoteState => {
  const query = useQuery({
    queryKey: [
      'migration-grace-renewal',
      publicClient.chain?.id,
      ownerAddress?.toLowerCase(),
      domains.map(({ name }) => name).sort(),
    ],
    enabled: enabled && !!ownerAddress && domains.length > 0,
    staleTime: 30_000,
    refetchInterval: enabled ? 30_000 : false,
    retry: false,
    queryFn: async () => {
      if (!ownerAddress) throw new Error('Connect your wallet to renew names.')
      const result = await getGraceRenewalQuote({
        domains,
        ownerAddress,
        publicClient,
      })
      if (result.isErr()) throw result.error
      return result.value
    },
  })

  if (!enabled || domains.length === 0) return { status: 'idle' }
  if (query.isPending || query.isFetching) return { status: 'loading' }
  if (query.isError) return { status: 'error', message: query.error.message }
  return { status: 'ready', quote: query.data }
}
