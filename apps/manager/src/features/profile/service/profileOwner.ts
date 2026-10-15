import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { getOwner as ensjsv1_getOwner } from '@ensdomains/ensjs/public/v1'
import { getOwner as ensjsv2_getOwner } from '@ensdomains/ensjs/public/v2'
import { permissionedRegistryGetStateSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { fromPromise, ok } from 'neverthrow'
import { type Address, labelhash, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import { isInGracePeriod } from '@/features/grace/utils/gracePeriod'
import { getNameDetail } from '@/features/shared/service/nameDetail'
import { sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { isDebugProfileName } from '@/utils/debug-features'
import { DEBUG_PROFILE_OWNER } from '../MOCK'
import { normalizeDnsName, normalizeEthName } from './profileName'

class GetOwnerError extends TaggedError('GetOwnerError')<{
  cause: unknown
}> {}

const ENS_REGISTRY = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensRegistry',
})

export type ProfileProtocol = 'v1' | 'v2'

export type ProfileOwnerResult = {
  readonly owner: Address | undefined
  readonly protocol: ProfileProtocol
}

const getV2GraceOwner = (state: {
  readonly expiry: bigint
  readonly latestOwner: Address
}): Address | undefined => {
  const isInGrace = isInGracePeriod(new Date(Number(state.expiry) * 1000), 'v2')

  return isInGrace && state.latestOwner !== zeroAddress
    ? state.latestOwner
    : undefined
}

export const getOwner = ResultFn(async function* (params: { name: string }) {
  if (isDebugProfileName(params.name)) {
    return ok({
      owner: DEBUG_PROFILE_OWNER,
      protocol: 'v2',
    } satisfies ProfileOwnerResult)
  }

  const ethName = normalizeEthName(params.name)

  // Non-.eth names (imported DNS names) only exist in the v1 registry;
  // the v2 registry is rooted at .eth
  if (!ethName) {
    const dnsName = normalizeDnsName(params.name)

    if (!dnsName) {
      return ok(null)
    }

    const client = yield* safeGetClient()

    const dnsOwner = yield* fromPromise(
      ensjsv1_getOwner(client, { name: dnsName }),
      (e) => new GetOwnerError({ cause: e }),
    )

    if (dnsOwner?.owner && dnsOwner.owner !== zeroAddress) {
      return ok({
        owner: dnsOwner.owner,
        protocol: 'v1',
      } satisfies ProfileOwnerResult)
    }

    return ok(null)
  }

  const client = yield* safeGetClient()

  const v2Owner = yield* fromPromise(
    ensjsv2_getOwner(client, { name: ethName.name }),
    (e) => new GetOwnerError({ cause: e }),
  )

  if (v2Owner && v2Owner !== zeroAddress) {
    return ok({
      owner: v2Owner,
      protocol: 'v2',
    } satisfies ProfileOwnerResult)
  }

  if (ethName.parentLabelsRootFirst.length === 0) {
    // Unindexed is an answer (null), not a failure. ENSv1 names, including
    // ones reserved in ENSv2 but not migrated, keep an ENSv1 authority; only
    // an ENSv2 authority makes this an ENSv2 name with no current owner.
    const detail = yield* getNameDetail(ethName.name).mapErr(
      (e) => new GetOwnerError({ cause: e }),
    )

    if (detail?.protocol === 'v2') {
      // Active ownership disappears at expiry. The registry retains the latest
      // owner, who can still renew their name during the grace period.
      const state = yield* fromPromise(
        readContract(client, {
          address: ENS_REGISTRY,
          abi: permissionedRegistryGetStateSnippet,
          functionName: 'getState',
          args: [BigInt(labelhash(ethName.leafLabel))],
        }),
        (e) => new GetOwnerError({ cause: e }),
      )
      return ok({
        owner: getV2GraceOwner(state),
        protocol: 'v2',
      } satisfies ProfileOwnerResult)
    }
  }

  const v1Owner = yield* fromPromise(
    ensjsv1_getOwner(client, { name: ethName.name }),
    (e) => new GetOwnerError({ cause: e }),
  )

  if (v1Owner?.owner && v1Owner.owner !== zeroAddress) {
    return ok({
      owner: v1Owner.owner,
      protocol: 'v1',
    } satisfies ProfileOwnerResult)
  }

  return ok(null)
})

export const profileOwnerQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'owner', { name }),
    queryFn: () => getOwner({ name }),
  })
