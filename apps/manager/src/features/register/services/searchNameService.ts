import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { l2EthRegistrarIsAvailableSnippet } from '@ensdomains/ensjs/contracts'
import { fromPromise, ok } from 'neverthrow'
import { readContract } from 'viem/actions'
import { sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'

const ethRegistrar = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensEthRegistrar',
})

export class NameAvailabilityError extends TaggedError(
  'NameAvailabilityError',
)<{
  cause: unknown
}> {}

export const checkNameAvailability = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()

  const cleanName = name.replace(/\.eth$/i, '')
  const nameWithEth = `${cleanName}.eth`
  const isAvailable = yield* await fromPromise(
    readContract(client, {
      address: ethRegistrar,
      abi: l2EthRegistrarIsAvailableSnippet,
      functionName: 'isAvailable',
      args: [cleanName],
    }),
    (e) => new NameAvailabilityError({ cause: e }),
  )

  return ok({
    isAvailable: Boolean(isAvailable),
    name: nameWithEth,
  })
})

export const searchNameQueryKey = createQueryKey<
  'searchName',
  {
    name: string
  }
>('searchName')

export const getSearchNameQueryOptions = (name: string) =>
  resultQueryOptions({
    queryKey: searchNameQueryKey({ name }),
    queryFn: ({ queryKey: [, { name }] }) => checkNameAvailability(name),
  })
