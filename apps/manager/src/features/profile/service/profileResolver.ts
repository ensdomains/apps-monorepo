import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import { zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import { ETH_REGISTRY_ABI } from '@/lib/eth-registry.abi'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetResolverError extends TaggedError('GetResolverError')<{
  cause: unknown
}> {}

export const getResolver = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()

  const cleanName = name.replace('.eth', '')

  const resolverAddress = yield* await fromPromise(
    readContract(client, {
      address: ENS_SEPOLIA_CONTRACTS.ETHRegistry,
      abi: ETH_REGISTRY_ABI,
      functionName: 'getResolver',
      args: [cleanName],
    }),
    (e) => new GetResolverError({ cause: e }),
  )

  if (!resolverAddress || resolverAddress === zeroAddress) {
    return ok(undefined)
  }

  return ok(resolverAddress)
})

export const profileResolverQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'resolver', { name }),
    queryFn: ({ queryKey: [{ name }] }) => getResolver(name),
  })
