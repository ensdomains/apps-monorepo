import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type {
  GetNameErrorType,
  GetNameReturnType,
} from '@ensdomains/ensjs/public'
import { getName } from '@ensdomains/ensjs/public'
import { ok } from 'neverthrow'
import type { Address } from 'viem'
import { safeGetClient } from '@/lib/wagmi/helpers'

export type ReverseResolutionResult = {
  coinType: number
  label: string
  icon: string
  // Reverse resolution result
  name: string | null
  reverseResolverAddress: Address | null
  resolverAddress: Address | null
  normalized: boolean
  // Forward resolution result - does this name resolve back to the address?
  forwardMatch: boolean
}

export class GetReverseResolutionError extends TaggedError(
  'GetReverseResolutionError',
)<{
  cause: GetNameErrorType
}> {}

export const getReverseResolution = ResultFn(async function* ({
  address,
  networks,
}: {
  address: Address
  networks: Array<{ coinType: number; label: string; icon: string }>
}) {
  const client = yield* safeGetClient()

  console.log('[getReverseResolution] Client chain:', client.chain.id, client.chain.name)
  console.log('[getReverseResolution] Address:', address)
  console.log('[getReverseResolution] Networks to query:', networks.length)

  // TEST: Try with a hardcoded test to see if getName works at all
  try {
    const testResult = await getName(client, {
      address: '0xb8c2C29ee19D8307cb7255e1Cd9CbDE883A267d5' as Address, // nick.eth on mainnet, likely won't work on sepolia
      coinType: 60,
    })
    console.log('[TEST] getName test with random address:', testResult)
  } catch (error) {
    console.log('[TEST] getName test failed (expected on Sepolia):', error)
  }

  // Fetch reverse resolution for all networks in parallel
  const reversePromises = networks.map(async (network) => {
    try {
      // Use getName with appropriate parameter:
      // - coinType 60 for default reverse record (addr.reverse)
      // - chainId for L2-specific reverse records
      const isDefault = network.coinType === 60
      
      console.log(`[getName] Calling with:`, {
        address,
        ...(isDefault ? { coinType: 60 } : { chainId: network.coinType }),
        label: network.label,
      })
      
      const nameResult: GetNameReturnType = await getName(client, {
        address,
        ...(isDefault ? { coinType: 60 } : { chainId: network.coinType }),
        // Try with allowMismatch to see if there's a reverse record but forward doesn't match
        allowMismatch: true,
      })
      
      console.log(`[getName] Result for ${network.label}:`, nameResult)

      if (!nameResult) {
        return {
          coinType: network.coinType,
          label: network.label,
          icon: network.icon,
          name: null,
          reverseResolverAddress: null,
          resolverAddress: null,
          normalized: true,
          forwardMatch: false,
        }
      }

      // Check forward match: does this name's match property indicate it resolves back?
      // The 'match' property from getName already does the forward resolution check
      const forwardMatch = nameResult.match

      return {
        coinType: network.coinType,
        label: network.label,
        icon: network.icon,
        name: nameResult.name,
        reverseResolverAddress: nameResult.reverseResolverAddress,
        resolverAddress: nameResult.resolverAddress,
        normalized: nameResult.normalized,
        forwardMatch,
      }
    } catch (error) {
      // Log error to see what's failing
      console.error(`[getName] Error for ${network.label}:`, error)
      return {
        coinType: network.coinType,
        label: network.label,
        icon: network.icon,
        name: null,
        reverseResolverAddress: null,
        resolverAddress: null,
        normalized: true,
        forwardMatch: false,
      }
    }
  })

  const results = await Promise.allSettled(reversePromises)

  // Convert PromiseSettledResults to our result type
  const resolvedResults: ReverseResolutionResult[] = results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value
    }
    // If promise was rejected, return a null result
    // This shouldn't happen since we're catching errors inside the promise
    const network = networks[index]
    return {
      coinType: network.coinType,
      label: network.label,
      icon: network.icon,
      name: null,
      reverseResolverAddress: null,
      resolverAddress: null,
      normalized: true,
      forwardMatch: false,
    }
  })

  return ok(resolvedResults)
})

export const getReverseResolutionQueryKey = createQueryKey<
  'get-reverse-resolution',
  { address: Address }
>('get-reverse-resolution')

export const getReverseResolutionQueryOptions = (params: {
  address: Address
  networks: Array<{ coinType: number; label: string; icon: string }>
}) =>
  resultQueryOptions({
    queryKey: getReverseResolutionQueryKey({
      address: params.address,
    }),
    queryFn: () => getReverseResolution(params),
  })
