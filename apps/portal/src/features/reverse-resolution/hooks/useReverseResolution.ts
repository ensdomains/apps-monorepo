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
  reverseRegistrarChainId: number
  label: string
  icon: string
  name: string | null
  reverseResolverAddress: Address | null
  resolverAddress: Address | null
  normalized: boolean
  forwardMatch: boolean
  defaultName: string | null
}

class GetReverseResolutionError extends TaggedError(
  'GetReverseResolutionError',
)<{
  cause: GetNameErrorType
}> {}

const getReverseResolution = ResultFn(async function* ({
  address,
  networks,
}: {
  address: Address
  networks: Array<{
    reverseRegistrarChainId: number
    label: string
    icon: string
  }>
}) {
  const client = yield* safeGetClient()

  const reversePromises = networks.map(async (network) => {
    try {
      const isDefault = network.reverseRegistrarChainId === 60
      const nameResult: GetNameReturnType = await getName(client, {
        address,
        ...(isDefault
          ? { reverseRegistrarChainId: 60 }
          : { chainId: network.reverseRegistrarChainId }),
      })

      if (!nameResult) {
        return {
          ...network,
          name: null,
          reverseResolverAddress: null,
          resolverAddress: null,
          normalized: true,
          forwardMatch: false,
          defaultName: null,
        }
      }

      const forwardMatch = nameResult.match

      return {
        ...network,
        name: nameResult.name,
        reverseResolverAddress: nameResult.reverseResolverAddress,
        resolverAddress: nameResult.resolverAddress,
        normalized: nameResult.normalized,
        forwardMatch,
        defaultName: null,
      }
    } catch (error) {
      // Log error to see what's failing
      console.error(`[getName] Error for ${network.label}:`, error)
      return {
        ...network,
        name: null,
        reverseResolverAddress: null,
        resolverAddress: null,
        normalized: true,
        forwardMatch: false,
        defaultName: null,
      }
    }
  })

  const results = await Promise.allSettled(reversePromises)

  const resolvedResults: ReverseResolutionResult[] = results.map(
    (result, index) => {
      if (result.status === 'fulfilled') {
        return result.value
      }
      const network = networks[index]
      return {
        ...network,
        name: null,
        reverseResolverAddress: null,
        resolverAddress: null,
        normalized: true,
        forwardMatch: false,
        defaultName: null,
      }
    },
  )

  const defaultResult = resolvedResults.find(
    (r) => r.reverseRegistrarChainId === 60,
  )
  const defaultName = defaultResult?.name ?? null

  const resultsWithDefault = resolvedResults.map((result) => ({
    ...result,
    defaultName,
  }))

  return ok(resultsWithDefault)
})

const getReverseResolutionQueryKey = createQueryKey<
  'get-reverse-resolution',
  { address: Address }
>('get-reverse-resolution')

export const getReverseResolutionQueryOptions = (params: {
  address: Address
  networks: Array<{
    reverseRegistrarChainId: number
    label: string
    icon: string
  }>
}) =>
  resultQueryOptions({
    queryKey: getReverseResolutionQueryKey({
      address: params.address,
    }),
    queryFn: () => getReverseResolution(params),
  })
