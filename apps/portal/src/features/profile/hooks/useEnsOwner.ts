import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  type GetOwnerErrorType as ensjsv1_GetOwnerErrorType,
  getOwner as ensjsv1_getOwner,
  type GetOwnerParameters,
} from '@ensdomains/ensjs/public/v1'
import {
  type GetOwnerErrorType as ensjsv2_GetOwnerErrorType,
  getOwner as ensjsv2_getOwner,
} from '@ensdomains/ensjs/public/v2'
import { makeLabelNodeAndParent } from '@ensdomains/ensjs/utils'
import { fromPromise, ok } from 'neverthrow'
import { type Address, zeroAddress } from 'viem'
import { namechainSepolia, sepoliaWithEns } from '@/lib/wagmi'
import {
  safeGetClient,
  safeGetNamechainSepoliaClient,
} from '@/lib/wagmi/helpers'
import type { WithEnsNetwork } from '@/utils/types'

export class GetEnsOwnerError extends TaggedError('GetEnsOwnerError')<{
  cause: ensjsv1_GetOwnerErrorType | ensjsv2_GetOwnerErrorType
}> {}

export type GetEnsOwnerReturnType = WithEnsNetwork<{
  owner: Address
  registryAddress: Address
}> | null

export const getEnsOwner = ResultFn(async function* (
  params: GetOwnerParameters,
) {
  const client = yield* safeGetClient()

  const l1v1Owner = yield* await fromPromise(
    ensjsv1_getOwner(client, params),
    (e) =>
      new GetEnsOwnerError({
        cause: e as ensjsv1_GetOwnerErrorType,
      }),
  )

  const { label } = makeLabelNodeAndParent(params.name)

  const namechainClient = yield* safeGetNamechainSepoliaClient()

  const v2EthRegistry = getChainContractAddress({
    chain: namechainSepolia,
    contract: 'ensV2EthRegistry',
  })

  const v1EthRegistry = getChainContractAddress({
    chain: sepoliaWithEns,
    contract: 'ensRegistry',
  })

  if (l1v1Owner?.owner)
    return ok<GetEnsOwnerReturnType>({
      owner: l1v1Owner?.owner,
      registryAddress: v1EthRegistry,
      network: 'sepolia',
    })

  const l2v2Owner = yield* await fromPromise(
    ensjsv2_getOwner(namechainClient, {
      label,
      registryAddress: v2EthRegistry,
    }),
    (e) => new GetEnsOwnerError({ cause: e as ensjsv2_GetOwnerErrorType }),
  )

  if (l2v2Owner && l2v2Owner !== zeroAddress)
    return ok<GetEnsOwnerReturnType>({
      owner: l2v2Owner,
      registryAddress: v2EthRegistry,
      network: 'namechainSepolia',
    })

  console.log({ l2v2Owner, l1v1Owner, v1EthRegistry, v2EthRegistry })

  return ok(null)
})

export const getEnsOwnerQueryKey = createQueryKey<
  'get-ens-owner',
  GetOwnerParameters
>('get-ens-owner')

export const getEnsOwnerQueryOptions = (params: GetOwnerParameters) =>
  resultQueryOptions({
    queryKey: getEnsOwnerQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getEnsOwner(params),
  })
