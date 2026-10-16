import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { fromPromise, ok } from 'neverthrow'
import {
  type Address,
  isAddressEqual,
  namehash,
  parseAbi,
  type ReadContractErrorType,
} from 'viem'
import { readContract } from 'viem/actions'
import { getAction } from 'viem/utils'
import { safeGetClient } from '@/lib/wagmi/helpers'

// Not exported by ensjs-abi yet.
const lockedMigrationControllerPublicResolverAbi = parseAbi([
  'function PUBLIC_RESOLVER() view returns (address)',
])
const publicResolverV2CanModifyNameAbi = parseAbi([
  'function canModifyName(bytes32 node, address operator) view returns (bool)',
])

class GetCanModifyOnPublicResolverV2Error extends TaggedError(
  'GetCanModifyOnPublicResolverV2Error',
)<{
  cause: ReadContractErrorType
}> {}

type GetCanModifyOnPublicResolverV2Params = {
  readonly resolverAddress: Address
  readonly name: string
  readonly account: Address
}

/**
 * Whether `account` can write `name`'s records on `resolverAddress`, when that
 * is the PublicResolverV2 migrated names are moved to. `false` for any other
 * resolver. PublicResolverV2 only authorises names the NameWrapper knows, so a
 * v2 owner of a never-wrapped name can't write there.
 */
export const getCanModifyOnPublicResolverV2 = ResultFn(async function* ({
  resolverAddress,
  name,
  account,
}: GetCanModifyOnPublicResolverV2Params) {
  const client = yield* safeGetClient()
  const readContractAction = getAction(client, readContract, 'readContract')
  const toError = (e: unknown) =>
    new GetCanModifyOnPublicResolverV2Error({
      cause: e as ReadContractErrorType,
    })

  const publicResolverV2 = yield* fromPromise(
    readContractAction({
      address: getChainContractAddress({
        chain: client.chain,
        contract: 'ensLockedMigrationController',
      }),
      abi: lockedMigrationControllerPublicResolverAbi,
      functionName: 'PUBLIC_RESOLVER',
    }),
    toError,
  )
  if (!isAddressEqual(publicResolverV2, resolverAddress)) return ok(false)

  const canModify = yield* fromPromise(
    readContractAction({
      address: resolverAddress,
      abi: publicResolverV2CanModifyNameAbi,
      functionName: 'canModifyName',
      args: [namehash(name), account],
    }),
    toError,
  )

  return ok(canModify)
})

const getCanModifyOnPublicResolverV2QueryKey = createQueryKey<
  'can-modify-on-public-resolver-v2',
  GetCanModifyOnPublicResolverV2Params
>('can-modify-on-public-resolver-v2')

export const getCanModifyOnPublicResolverV2QueryOptions = (
  params: GetCanModifyOnPublicResolverV2Params,
) =>
  resultQueryOptions({
    queryKey: getCanModifyOnPublicResolverV2QueryKey(params),
    queryFn: ({ queryKey: [, queryParams] }) =>
      getCanModifyOnPublicResolverV2(queryParams),
  })
