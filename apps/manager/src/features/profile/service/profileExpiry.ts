import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import { readContract } from 'viem/actions'
import { ETH_REGISTRY_ABI } from '@/lib/eth-registry.abi'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetExpiryError extends TaggedError('GetExpiryError')<{
  cause: unknown
}> {}

export const getExpiry = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()
  const cleanName = name.replace('.eth', '')

  const [, entry] = (yield* await fromPromise(
    readContract(client, {
      address: ENS_SEPOLIA_CONTRACTS.ETHRegistry,
      abi: ETH_REGISTRY_ABI,
      functionName: 'getNameData',
      args: [cleanName],
    }),
    (e) => new GetExpiryError({ cause: e }),
  )) as unknown as [
    bigint,
    {
      expiry: bigint
    },
  ]

  if (!entry || entry.expiry === 0n) {
    return ok({ expiry: undefined as unknown as bigint })
  }

  return ok({
    expiry: entry.expiry,
  } as { expiry: bigint })
})

export const profileExpiryQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'expiry', { name }),
    queryFn: ({ queryKey: [{ name }] }) => getExpiry(name),
  })
