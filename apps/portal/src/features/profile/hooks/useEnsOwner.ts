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
import { err, fromPromise, ok } from 'neverthrow'
import { type Address, zeroAddress } from 'viem'
import { sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'
import type { ProtocolVersion } from '@/utils/types'

class NameRequiredError extends TaggedError('NameRequiredError')<{
  message: 'Name is required'
}> {}

export class GetEnsOwnerError extends TaggedError('GetEnsOwnerError')<{
  cause:
    | ensjsv1_GetOwnerErrorType
    | ensjsv2_GetOwnerErrorType
    | NameRequiredError
}> {}

export type GetEnsOwnerReturnType = {
  owner: Address
  registryAddress: Address
  protocolVersion: ProtocolVersion
} | null

const v2EthRegistry = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensRegistry',
})

const v1EthRegistry = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensLegacyRegistry',
})

type GetEnsOwnerParameters = {
  name: string | undefined
}

export const getEnsOwner = ResultFn(async function* ({
  name,
}: GetEnsOwnerParameters) {
  const client = yield* safeGetClient()

  if (!name) {
    return err(
      new GetEnsOwnerError({
        cause: new NameRequiredError({ message: 'Name is required' }),
      }),
    )
  }

  // Try V2 registry first
  const labels = name.split('.')
  let registryAddress: Address = v2EthRegistry
  if (labels.length > 2) {
    registryAddress = yield* fromPromise(
      getNameRegistryAddress(client, {
        registryAddress: v2EthRegistry,
        label: labels[1],
      }),
      (e) =>
        new GetEnsOwnerError({ cause: e as GetNameRegistryAddressErrorType }),
    )
  }

  if (registryAddress !== zeroAddress) {
    const v2Owner = yield* fromPromise(
      ensjsv2_getOwner(client, {
        label: labels[0],
        registryAddress,
      }),
      (e) => new GetEnsOwnerError({ cause: e as ensjsv2_GetOwnerErrorType }),
    )

    if (v2Owner && v2Owner !== zeroAddress)
      return ok<GetEnsOwnerReturnType>({
        owner: v2Owner,
        registryAddress,
        protocolVersion: 'ENSv2',
      })
  }

  // Fall back to V1 registry
  const v1Owner = yield* fromPromise(
    ensjsv1_getOwner(client, { name }),
    (e) =>
      new GetEnsOwnerError({
        cause: e as ensjsv1_GetOwnerErrorType,
      }),
  )

  if (v1Owner?.owner)
    return ok<GetEnsOwnerReturnType>({
      owner: v1Owner.owner,
      registryAddress: v1EthRegistry,
      protocolVersion: 'ENSv1',
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
