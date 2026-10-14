import type { V1Domain } from '@ens-apps/migration'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import type { Address, PublicClient } from 'viem'
import {
  type GraceRenewalQuote,
  getGraceRenewalQuote,
} from '../service/graceRenewal'

export type GraceRenewalQuoteState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly quote: GraceRenewalQuote }

export const graceRenewalQuoteQueryKey = createQueryKey<
  'migration-grace-renewal',
  {
    readonly chainId: number | undefined
    readonly ownerAddress: string | undefined
    readonly names: readonly string[]
  }
>('migration-grace-renewal')

// Match the execution-time quote lifetime; a background refresh must not keep
// an expired price actionable while its replacement is still loading.
const QUOTE_LIFETIME_MS = 5 * 60 * 1000

const isQuoteExpired = (quote: GraceRenewalQuote): boolean => {
  const now = Date.now()
  return (
    BigInt(Math.floor(now / 1000)) >= quote.expiresAt ||
    now - quote.quotedAtMs >= QUOTE_LIFETIME_MS
  )
}

export const withRenewalAccountReadiness = (
  state: GraceRenewalQuoteState,
  isReady: boolean,
  error: string | null | undefined,
): GraceRenewalQuoteState => {
  if (state.status === 'idle') return state
  if (error) return { status: 'error', message: error }
  if (!isReady) return { status: 'loading' }
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
    queryKey: graceRenewalQuoteQueryKey({
      chainId: publicClient.chain?.id,
      ownerAddress: ownerAddress?.toLowerCase(),
      names: domains.map(({ name }) => name).sort(),
    }),
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

  if (!enabled || !ownerAddress || domains.length === 0) {
    return { status: 'idle' }
  }
  if (query.isError) return { status: 'error', message: query.error.message }
  if (query.isPending || !query.data || isQuoteExpired(query.data)) {
    return { status: 'loading' }
  }
  return { status: 'ready', quote: query.data }
}
