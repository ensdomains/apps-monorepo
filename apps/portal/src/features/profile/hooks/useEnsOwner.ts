import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  type GetOwnerErrorType,
  type GetOwnerParameters,
  getOwner,
} from '@ensdomains/ensjs/public'
import {
  type GetRegistryOwnerByLabelErrorType,
  getRegistryOwnerByLabel,
} from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import { type Address, zeroAddress } from 'viem'
import {
  safeGetClient,
  safeGetNamechainSepoliaClient,
} from '@/lib/wagmi/helpers'

export class GetEnsOwnerError extends TaggedError('GetEnsOwnerError')<{
  cause: GetOwnerErrorType | GetRegistryOwnerByLabelErrorType
}> {}

// ensjs doesn't work well with multichain yet
const namechainEthRegistryAddress = '0x5fb63bbd34de21688c8aa8131be1c3b4a477109c'

export const getEnsOwner = ResultFn(async function* (
  params: GetOwnerParameters,
) {
  const client = yield* safeGetClient()

  const l1v1Owner = yield* await fromPromise(
    getOwner(client, params),
    (e) =>
      new GetEnsOwnerError({
        cause: e as GetOwnerErrorType,
      }),
  )

  const label = params.name.split('.').slice(0, -1).join('')

  const namechainClient = yield* safeGetNamechainSepoliaClient()

  const l2v2Owner = yield* await fromPromise(
    getRegistryOwnerByLabel(namechainClient, {
      label,
      registryAddress: namechainEthRegistryAddress,
    }),
    (e) =>
      new GetEnsOwnerError({ cause: e as GetRegistryOwnerByLabelErrorType }),
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
