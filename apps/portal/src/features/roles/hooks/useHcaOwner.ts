import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { fromPromise, ok } from 'neverthrow'
import { type Address, isAddressEqual, parseAbi, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import { getAction } from 'viem/utils'
import { ensChain } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'

class HcaOwnerError extends TaggedError('HcaOwnerError')<{
  cause: unknown
}> {}

const HCA_FACTORY_ABI = parseAbi([
  'function authorizedOwnerOf(address hca) view returns (address)',
])

const HCA_FACTORY = getChainContractAddress({
  chain: ensChain,
  contract: 'ensHcaFactory',
})

type GetHcaOwnerParameters = {
  readonly account: Address
}

/** The wallet an HCA acts for, certified by the HCA factory; null for any other address. */
export const getHcaOwner = ResultFn(async function* ({
  account,
}: GetHcaOwnerParameters) {
  const client = yield* safeGetClient()
  const owner = yield* fromPromise(
    getAction(
      client,
      readContract,
      'readContract',
    )({
      address: HCA_FACTORY,
      abi: HCA_FACTORY_ABI,
      functionName: 'authorizedOwnerOf',
      args: [account],
    }),
    (cause) => new HcaOwnerError({ cause }),
  )
  return ok(isAddressEqual(owner, zeroAddress) ? null : owner)
})

const getHcaOwnerQueryKey = createQueryKey<
  'get-hca-owner',
  GetHcaOwnerParameters
>('get-hca-owner')

export const getHcaOwnerQueryOptions = (params: GetHcaOwnerParameters) =>
  resultQueryOptions({
    queryKey: getHcaOwnerQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getHcaOwner(params),
    // The factory binding is written once and never changes.
    staleTime: Number.POSITIVE_INFINITY,
  })
