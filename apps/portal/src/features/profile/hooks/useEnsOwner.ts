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
import { getTLD } from '@/utils/ens/tldHelpers'
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

  // Try V2 registry first — but only for names under the .eth TLD.
  // The V2 registry is rooted at .eth, so traversing it for a non-.eth name
  // (e.g. florin.xyz) would incorrectly resolve against the .eth namespace
  // and report florin.eth's owner as the owner of florin.xyz.
  const labels = name.split('.')
  const tld = getTLD(name)
  if (tld === 'eth') {
    let registryAddress: Address = v2EthRegistry
    // For names deeper than 2LD, walk down from the .eth root to the
    // immediate parent's subregistry. e.g. for `sub.florin.eth` look up
    // the subregistry for `florin` under .eth, then read `sub` from it.
    for (let i = labels.length - 2; i >= 1; i--) {
      registryAddress = yield* fromPromise(
        getNameRegistryAddress(client, {
          registryAddress,
          label: labels[i],
        }),
        (e) =>
          new GetEnsOwnerError({
            cause: e as GetNameRegistryAddressErrorType,
          }),
      )
      if (registryAddress === zeroAddress) break
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
