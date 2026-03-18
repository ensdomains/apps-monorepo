import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  type GetOwnerErrorType as ensjsv1_GetOwnerErrorType,
  getOwner as ensjsv1_getOwner,
} from '@ensdomains/ensjs/public/v1'
import {
  type GetOwnerErrorType as ensjsv2_GetOwnerErrorType,
  getOwner as ensjsv2_getOwner,
  type GetNameRegistryAddressErrorType,
  getNameRegistryAddress,
} from '@ensdomains/ensjs/public/v2'
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

const v2EthRegistry = getChainContractAddress({
  chain: namechainSepolia,
  contract: 'ensV2EthRegistry',
})

const v1EthRegistry = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensRegistry',
})

type GetEnsOwnerParameters = {
  name: string
}

export const getEnsOwner = ResultFn(async function* ({
  name,
}: GetEnsOwnerParameters) {
  const client = yield* safeGetClient()

  const l1v1Owner = yield* fromPromise(
    ensjsv1_getOwner(client, { name }),
    (e) =>
      new GetEnsOwnerError({
        cause: e as ensjsv1_GetOwnerErrorType,
      }),
  )

  const namechainClient = yield* safeGetNamechainSepoliaClient()

  if (l1v1Owner?.owner)
    return ok<GetEnsOwnerReturnType>({
      owner: l1v1Owner?.owner,
      registryAddress: v1EthRegistry,
      network: 'sepolia',
    })

  const labels = name.split('.')
  let registryAddress: Address = v2EthRegistry
  if (labels.length > 2) {
    registryAddress = yield* fromPromise(
      getNameRegistryAddress(namechainClient, {
        registryAddress: v2EthRegistry,
        label: labels[1],
      }),
      (e) =>
        new GetEnsOwnerError({ cause: e as GetNameRegistryAddressErrorType }),
    )
    if (registryAddress === zeroAddress) return ok(null)
  }

  const l2v2Owner = yield* fromPromise(
    ensjsv2_getOwner(namechainClient, {
      label: labels[0],
      registryAddress,
    }),
    (e) => new GetEnsOwnerError({ cause: e as ensjsv2_GetOwnerErrorType }),
  )

  if (l2v2Owner && l2v2Owner !== zeroAddress)
    return ok<GetEnsOwnerReturnType>({
      owner: l2v2Owner,
      registryAddress,
      network: 'namechainSepolia',
    })

  return ok(null)
})

const getEnsOwnerQueryKey = createQueryKey<
  'get-ens-owner',
  GetEnsOwnerParameters
>('get-ens-owner')

export const getEnsOwnerQueryOptions = (params: GetEnsOwnerParameters) =>
  resultQueryOptions({
    queryKey: getEnsOwnerQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getEnsOwner(params),
  })
