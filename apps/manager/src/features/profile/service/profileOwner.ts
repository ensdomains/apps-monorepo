import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  getNameRegistryAddress as ensjsv2_getNameRegistryAddress,
  getOwner as ensjsv2_getOwner,
} from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import { type Address, zeroAddress } from 'viem'
import { sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { normalizeEthName } from './profileName'

class GetOwnerError extends TaggedError('GetOwnerError')<{
  cause: unknown
}> {}

const ENS_REGISTRY = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensRegistry',
})

export const getOwner = ResultFn(async function* (params: { name: string }) {
  const ethName = normalizeEthName(params.name)

  if (!ethName) {
    return ok(null)
  }

  const client = yield* safeGetClient()
  let registryAddress: Address = ENS_REGISTRY

  for (const label of ethName.parentLabelsRootFirst) {
    const nextRegistryAddress = yield* fromPromise(
      ensjsv2_getNameRegistryAddress(client, {
        registryAddress,
        label,
      }),
      (e) => new GetOwnerError({ cause: e }),
    )

    if (nextRegistryAddress === zeroAddress) {
      return ok(null)
    }

    registryAddress = nextRegistryAddress
  }

  const owner = yield* fromPromise(
    ensjsv2_getOwner(client, {
      registryAddress,
      label: ethName.leafLabel,
    }),
    (e) => new GetOwnerError({ cause: e }),
  )

  if (owner && owner !== zeroAddress) {
    return ok({ owner: owner as Address })
  }

  return ok(null)
})

export const profileOwnerQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'owner', { name }),
    queryFn: () => getOwner({ name }),
  })
