import { DomainDocument, type DomainQuery } from '@ens-apps/indexer'
import indexerClient from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { getOwner as ensjsv1_getOwner } from '@ensdomains/ensjs/public/v1'
import { getOwner as ensjsv2_getOwner } from '@ensdomains/ensjs/public/v2'
import { permissionedRegistryGetStatusSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { fromPromise, ok } from 'neverthrow'
import { type Address, labelhash, namehash, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import { sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { normalizeDnsName, normalizeEthName } from './profileName'

const V2_NAME_STATUS = {
  RESERVED: 1,
  REGISTERED: 2,
} as const

const ETH_REGISTRY = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensRegistry',
})

class GetOwnerError extends TaggedError('GetOwnerError')<{
  cause: unknown
}> {}

export type ProfileProtocol = 'v1' | 'v2'

export type ProfileOwnerResult = {
  readonly owner: Address | undefined
  readonly protocol: ProfileProtocol
}

const getDnsOwner = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()
  const owner = yield* fromPromise(
    ensjsv1_getOwner(client, { name }),
    (e) => new GetOwnerError({ cause: e }),
  )

  if (!owner?.owner || owner.owner === zeroAddress) return ok(null)

  return ok({
    owner: owner.owner,
    protocol: 'v1',
  } satisfies ProfileOwnerResult)
})

const getEth2LdOwner = ResultFn(async function* (params: {
  readonly label: string
  readonly name: string
}) {
  const client = yield* safeGetClient()
  const status = yield* fromPromise(
    readContract(client, {
      address: ETH_REGISTRY,
      abi: permissionedRegistryGetStatusSnippet,
      functionName: 'getStatus',
      args: [BigInt(labelhash(params.label))],
    }),
    (e) => new GetOwnerError({ cause: e }),
  )

  if (status === V2_NAME_STATUS.REGISTERED) {
    const owner = yield* fromPromise(
      ensjsv2_getOwner(client, { name: params.name }),
      (e) => new GetOwnerError({ cause: e }),
    )

    return ok({
      owner: owner && owner !== zeroAddress ? owner : undefined,
      protocol: 'v2',
    } satisfies ProfileOwnerResult)
  }

  const v1Owner = yield* fromPromise(
    ensjsv1_getOwner(client, { name: params.name }),
    (e) => new GetOwnerError({ cause: e }),
  )

  if (v1Owner?.owner && v1Owner.owner !== zeroAddress) {
    return ok({
      owner: v1Owner.owner,
      protocol: 'v1',
    } satisfies ProfileOwnerResult)
  }

  // RESERVED identifies an unmigrated V1 registration. The V2 Universal
  // Resolver may bridge it to V1, but that does not make it editable in V2.
  if (status === V2_NAME_STATUS.RESERVED) return ok(null)

  const v2Domain = yield* fromPromise(
    indexerClient
      .query<DomainQuery>(DomainDocument, { id: namehash(params.name) })
      .toPromise()
      .then((result) => {
        if (result.error) throw result.error
        return result.data?.domain ?? null
      }),
    (e) => new GetOwnerError({ cause: e }),
  )

  if (v2Domain) {
    return ok({
      owner: undefined,
      protocol: 'v2',
    } satisfies ProfileOwnerResult)
  }

  return ok(null)
})

const getEthSubnameOwner = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()
  const v2Owner = yield* fromPromise(
    ensjsv2_getOwner(client, { name }),
    (e) => new GetOwnerError({ cause: e }),
  )

  if (v2Owner && v2Owner !== zeroAddress) {
    return ok({
      owner: v2Owner,
      protocol: 'v2',
    } satisfies ProfileOwnerResult)
  }

  const v1Owner = yield* fromPromise(
    ensjsv1_getOwner(client, { name }),
    (e) => new GetOwnerError({ cause: e }),
  )

  if (!v1Owner?.owner || v1Owner.owner === zeroAddress) return ok(null)

  return ok({
    owner: v1Owner.owner,
    protocol: 'v1',
  } satisfies ProfileOwnerResult)
})

export const getOwner = ResultFn(async function* (params: { name: string }) {
  const ethName = normalizeEthName(params.name)

  if (ethName?.parentLabelsRootFirst.length === 0) {
    const owner = yield* getEth2LdOwner({
      label: ethName.leafLabel,
      name: ethName.name,
    })
    return ok(owner)
  }

  if (ethName) {
    const owner = yield* getEthSubnameOwner(ethName.name)
    return ok(owner)
  }

  // Imported DNS names only exist in the V1 registry. V2 is rooted at .eth.
  const dnsName = normalizeDnsName(params.name)
  if (!dnsName) return ok(null)

  const owner = yield* getDnsOwner(dnsName)
  return ok(owner)
})

export const profileOwnerQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'owner', { name }),
    queryFn: () => getOwner({ name }),
  })
