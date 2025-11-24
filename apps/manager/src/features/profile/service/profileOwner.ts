import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
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
import { getChainContractAddress, zeroAddress } from 'viem'
import {
  safeGetClient,
  safeGetNamechainSepoliaClient,
} from '@/lib/wagmi/helpers'

class GetOwnerError extends TaggedError('GetOwnerError')<{
  cause: ensjsv1_GetOwnerErrorType | ensjsv2_GetOwnerErrorType
}> {}

// TODO: Remove this once we have a proper namechain client
const namechainEthRegistryAddress = '0x5fb63bbd34de21688c8aa8131be1c3b4a477109c'

export const getOwner = ResultFn(async function* (params: GetOwnerParameters) {
  const client = yield* safeGetClient()

  const l1v1Owner = yield* await fromPromise(
    // @ts-expect-error
    ensjsv1_getOwner(client, params),
    (e) => new GetOwnerError({ cause: e as ensjsv1_GetOwnerErrorType }),
  )

  const label = params.name.split('.').slice(0, -1).join('')

  const namechainClient = yield* safeGetNamechainSepoliaClient()

  const l2v2Owner = yield* await fromPromise(
    ensjsv2_getOwner(namechainClient, {
      label,
      registryAddress: namechainEthRegistryAddress,
    }),
    (e) => new GetOwnerError({ cause: e as ensjsv2_GetOwnerErrorType }),
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

export const profileOwnerQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'owner', { name }),
    queryFn: () => getOwner({ name }),
  })
