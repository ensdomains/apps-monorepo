import { fromSync, ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { fromPromise, ok } from 'neverthrow'
import {
  type Address,
  type Hex,
  namehash,
  parseAbi,
  type ReadContractErrorType,
} from 'viem'
import { readContract } from 'viem/actions'
import { normalize } from 'viem/ens'
import { getAction } from 'viem/utils'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { getParentName, is2LD } from '@/utils/ens/tldHelpers'
import { NameNotNormalizableError } from './getV1NameState'

// ensjs-abi doesn't export the NameWrapper's `canModifyName`.
const nameWrapperCanModifyNameAbi = parseAbi([
  'function canModifyName(bytes32 node, address addr) view returns (bool)',
])

export class GetV1WrapperAccessError extends TaggedError(
  'GetV1WrapperAccessError',
)<{
  cause: ReadContractErrorType
}> {}

/**
 * NameWrapper `canModifyName(node, account)` for the name and its parent: the
 * check its `onlyTokenOwner` writes make. True for the wrapper holder and for
 * any operator it approved with `setApprovalForAll`, outside a `.eth` 2LD's
 * grace period. The registry and resolvers keep approvals of their own.
 */
export type V1WrapperAccess = {
  readonly canModifyName: boolean
  /** False for a 2LD, whose parent is a TLD. */
  readonly canModifyParent: boolean
}

type GetV1WrapperAccessParameters = {
  readonly name: string
  readonly account: Address
}

const getV1WrapperAccess = ResultFn(async function* ({
  name: rawName,
  account,
}: GetV1WrapperAccessParameters) {
  const name = yield* fromSync(
    () => normalize(rawName),
    (e) => new NameNotNormalizableError({ cause: e }),
  )
  const parentName = is2LD(name) ? null : getParentName(name)

  const client = yield* safeGetClient()
  const readCanModifyName = (node: Hex) =>
    getAction(
      client,
      readContract,
      'readContract',
    )({
      address: getChainContractAddress({
        chain: client.chain,
        contract: 'ensNameWrapper',
      }),
      abi: nameWrapperCanModifyNameAbi,
      functionName: 'canModifyName',
      args: [node, account],
    })

  const [canModifyName, canModifyParent] = yield* fromPromise(
    Promise.all([
      readCanModifyName(namehash(name)),
      parentName ? readCanModifyName(namehash(parentName)) : false,
    ]),
    (e) => new GetV1WrapperAccessError({ cause: e as ReadContractErrorType }),
  )

  return ok<V1WrapperAccess>({ canModifyName, canModifyParent })
})

const getV1WrapperAccessQueryKey = createQueryKey<
  'transfer-v1-wrapper-access',
  GetV1WrapperAccessParameters
>('transfer-v1-wrapper-access')

export const getV1WrapperAccessQueryOptions = (
  params: GetV1WrapperAccessParameters,
) =>
  resultQueryOptions({
    queryKey: getV1WrapperAccessQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getV1WrapperAccess(params),
  })
