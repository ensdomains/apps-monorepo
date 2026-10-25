import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { fromPromise, ok } from 'neverthrow'
import {
  type Address,
  BaseError,
  type CallErrorType,
  ExecutionRevertedError,
  encodeFunctionData,
  isAddressEqual,
  namehash,
  parseAbi,
  type ReadContractErrorType,
} from 'viem'
import { call, readContract } from 'viem/actions'
import { getAction } from 'viem/utils'
import { safeGetClient } from '@/lib/wagmi/helpers'

// Not exported by ensjs-abi yet.
const lockedMigrationControllerPublicResolverAbi = parseAbi([
  'function PUBLIC_RESOLVER() view returns (address)',
])
const publicResolverV2CanModifyNameAbi = parseAbi([
  'function canModifyName(bytes32 node, address operator) view returns (bool)',
])
const nodeSetTextAbi = parseAbi([
  'function setText(bytes32 node, string key, string value)',
])

class GetCanModifyNameOnResolverError extends TaggedError(
  'GetCanModifyNameOnResolverError',
)<{
  cause: ReadContractErrorType | CallErrorType
}> {}

type GetCanModifyNameOnResolverParams = {
  readonly resolverAddress: Address
  readonly name: string
  readonly account: Address
}

const isRevert = (error: unknown): boolean =>
  error instanceof BaseError &&
  error.walk((e) => e instanceof ExecutionRevertedError) !== null

/**
 * Whether `account` can write `name`'s records on a non-permissioned
 * resolver. PublicResolverV2 answers through `canModifyName`; any other
 * resolver, such as the V1 PublicResolver a recreated child keeps, is asked by
 * dry-running the node-based `setText` that saving records sends. A revert
 * means no; any other failure is an error, so the caller doesn't guess.
 */
export const getCanModifyNameOnResolver = ResultFn(async function* ({
  resolverAddress,
  name,
  account,
}: GetCanModifyNameOnResolverParams) {
  const client = yield* safeGetClient()
  const toError = (e: unknown) =>
    new GetCanModifyNameOnResolverError({
      cause: e as ReadContractErrorType | CallErrorType,
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

  const canWrite = yield* fromPromise(
    getAction(
      client,
      call,
      'call',
    )({
      account,
      to: resolverAddress,
      data: encodeFunctionData({
        abi: nodeSetTextAbi,
        functionName: 'setText',
        args: [namehash(name), 'description', ''],
      }),
    }).then(
      () => true,
      (error: unknown) => {
        if (isRevert(error)) return false
        throw error
      },
    ),
    toError,
  )
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
