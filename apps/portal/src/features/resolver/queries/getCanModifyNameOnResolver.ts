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
import { getCanWriteRecordsOnResolver } from './getCanWriteRecordsOnResolver'

// Not exported by ensjs-abi yet.
const lockedMigrationControllerPublicResolverAbi = parseAbi([
  'function PUBLIC_RESOLVER() view returns (address)',
])
const publicResolverV2CanModifyNameAbi = parseAbi([
  'function canModifyName(bytes32 node, address operator) view returns (bool)',
])

class GetCanModifyNameOnResolverError extends TaggedError(
  'GetCanModifyNameOnResolverError',
)<{
  cause: ReadContractErrorType
}> {}

type GetCanModifyNameOnResolverParams = {
  readonly resolverAddress: Address
  readonly name: string
  readonly account: Address
}

/**
 * Whether `account` can write `name`'s records on a non-permissioned
 * resolver. PublicResolverV2 answers through `canModifyName`; any other
 * resolver, such as the V1 PublicResolver a recreated child keeps, is asked by
 * {@link getCanWriteRecordsOnResolver}'s dry run of the record writes a save
 * sends.
 */
export const getCanModifyNameOnResolver = ResultFn(async function* ({
  resolverAddress,
  name,
  account,
}: GetCanModifyNameOnResolverParams) {
  const client = yield* safeGetClient()
  const toError = (e: unknown) =>
    new GetCanModifyNameOnResolverError({
      cause: e as ReadContractErrorType,
    })

  const publicResolverV2 = yield* fromPromise(
    getAction(
      client,
      readContract,
      'readContract',
    )({
      address: getChainContractAddress({
        chain: client.chain,
        contract: 'ensLockedMigrationController',
      }),
      abi: lockedMigrationControllerPublicResolverAbi,
      functionName: 'PUBLIC_RESOLVER',
    }),
    toError,
  )
  if (isAddressEqual(publicResolverV2, resolverAddress)) {
    const canModify = yield* fromPromise(
      getAction(
        client,
        readContract,
        'readContract',
      )({
        address: resolverAddress,
        abi: publicResolverV2CanModifyNameAbi,
        functionName: 'canModifyName',
        args: [namehash(name), account],
      }),
      toError,
    )
    return ok(canModify)
  }

  const canWrite = yield* getCanWriteRecordsOnResolver({
    resolverAddress,
    name,
    account,
  })
  return ok(canWrite)
})

const getCanModifyNameOnResolverQueryKey = createQueryKey<
  'can-modify-name-on-resolver',
  GetCanModifyNameOnResolverParams
>('can-modify-name-on-resolver')

export const getCanModifyNameOnResolverQueryOptions = (
  params: GetCanModifyNameOnResolverParams,
) =>
  resultQueryOptions({
    queryKey: getCanModifyNameOnResolverQueryKey(params),
    queryFn: ({ queryKey: [, queryParams] }) =>
      getCanModifyNameOnResolver(queryParams),
  })
