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
import { fromPromise, ok } from 'neverthrow'
import { zeroAddress } from 'viem'
import {
  safeGetClient,
  safeGetNamechainSepoliaClient,
} from '@/lib/wagmi/helpers'

export class GetEnsOwnerError extends TaggedError('GetEnsOwnerError')<{
  cause: ensjsv1_GetOwnerErrorType | ensjsv2_GetOwnerErrorType
}> {}

// ensjs doesn't work well with multichain yet
const namechainEthRegistryAddress = '0x5fb63bbd34de21688c8aa8131be1c3b4a477109c'

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

  const label = params.name.split('.').slice(0, -1).join('')

  const namechainClient = yield* safeGetNamechainSepoliaClient()

  const l2v2Owner = yield* await fromPromise(
    ensjsv2_getOwner(namechainClient, {
      label,
      registryAddress: namechainEthRegistryAddress,
    }),
    (e) => new GetEnsOwnerError({ cause: e as ensjsv2_GetOwnerErrorType }),
  )

  if (l1v1Owner?.owner)
    return ok({
      owner: l1v1Owner?.owner,
      registryAddress: getChainContractAddress({
        chain: client.chain,
        contract: 'ensRegistry',
      }),
      network: 'sepolia',
    } as const)

  if (l2v2Owner && l2v2Owner !== zeroAddress)
    return ok({
      owner: l2v2Owner,
      registryAddress: namechainEthRegistryAddress,
      network: 'namechainSepolia',
    } as const)

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
