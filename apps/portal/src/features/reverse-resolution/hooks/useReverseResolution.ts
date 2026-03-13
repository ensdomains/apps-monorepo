import { l2ReverseRegistrarNameForAddrSnippet } from '@ens-apps/l2-primary/L2ReverseRegistrar'
import type { ReverseRegistrarChainId } from '@ens-apps/l2-primary/reverseRegistrarChainIds'
import {
  getChainIdForReverseRegistrarChainId,
  getRegistrarAddress,
} from '@ens-apps/l2-primary/reverseRegistrarChainIds'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getAddressRecord, getName } from '@ensdomains/ensjs/public'
import { ok } from 'neverthrow'
import type { Address } from 'viem'
import { readContract } from 'viem/actions'
import { getAction } from 'viem/utils'
import { wagmiConfig } from '@/lib/wagmi'
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

/** Network for reverse resolution lookups. Must match the client chain (safeGetClient uses Sepolia). */
const REVERSE_RESOLUTION_NETWORK = 'sepolia' as const

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
  const l1Client = yield* safeGetClient()

  const reversePromises = networks.map(async (network) => {
    try {
      const isDefault = network.reverseRegistrarChainId === 60
      const isL1 = isDefault || network.reverseRegistrarChainId === 1

      if (isL1) {
        // L1: use Universal Resolver via getName (addr.reverse)
        const nameResult = await getName(l1Client, {
          address,
          coinType: 60,
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

        return {
          ...network,
          name: nameResult.name,
          reverseResolverAddress: nameResult.reverseResolverAddress,
          resolverAddress: nameResult.resolverAddress,
          normalized: nameResult.normalized,
          forwardMatch: nameResult.match,
          defaultName: null,
        }
      }

      // L2: read directly from L2 Reverse Registrar (Universal Resolver may not
      // have L2 reverse namespaces configured on Sepolia)
      const registrarAddress = getRegistrarAddress(
        network.reverseRegistrarChainId as ReverseRegistrarChainId,
        REVERSE_RESOLUTION_NETWORK,
      )

      if (!registrarAddress) {
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

      const chainId = getChainIdForReverseRegistrarChainId(
        network.reverseRegistrarChainId as ReverseRegistrarChainId,
        REVERSE_RESOLUTION_NETWORK,
      ) as 11155420 | 421614 | 84532 | 59141 | 534351

      const l2Client = wagmiConfig.getClient({ chainId })
      if (!l2Client) {
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

      const readContractAction = getAction(
        l2Client,
        readContract,
        'readContract',
      )
      const name = await readContractAction({
        address: registrarAddress,
        abi: l2ReverseRegistrarNameForAddrSnippet,
        functionName: 'nameForAddr',
        args: [address],
      })

      if (!name || name === '') {
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

      // Verify forward resolution (name → address) via L1 ENS
      let forwardMatch = true
      try {
        const addrRecord = await getAddressRecord(l1Client, { name })
        forwardMatch =
          !!addrRecord?.value &&
          addrRecord.value.toLowerCase() === address.toLowerCase()
      } catch {
        forwardMatch = false
      }

      return {
        ...network,
        name,
        reverseResolverAddress: null,
        resolverAddress: null,
        normalized: true,
        forwardMatch,
        defaultName: null,
      }
    } catch (error) {
      console.error(`[getReverseResolution] Error for ${network.label}:`, error)
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
