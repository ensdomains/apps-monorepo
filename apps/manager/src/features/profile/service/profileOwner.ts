import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  getExpiry as ensjsv1_getExpiry,
  getOwner as ensjsv1_getOwner,
} from '@ensdomains/ensjs/public/v1'
import { getOwner as ensjsv2_getOwner } from '@ensdomains/ensjs/public/v2'
import { nameWrapperGetDataSnippet } from '@ensdomains/ensjs-abi/v1/nameWrapper'
import { permissionedRegistryGetStateSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { fromPromise, ok } from 'neverthrow'
import {
  type Address,
  type Client,
  isAddressEqual,
  labelhash,
  namehash,
  type Transport,
  zeroAddress,
} from 'viem'
import { readContract } from 'viem/actions'
import { getGraceEndDate } from '@/features/grace/utils/gracePeriod'
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

const NAME_WRAPPER = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensNameWrapper',
})

export type ProfileProtocol = 'v1' | 'v2'

export type ProfileOwnerResult = {
  readonly owner: Address | undefined
  readonly protocol: ProfileProtocol
}

const isRegistrationInGrace = (
  expiry: bigint,
  protocol: ProfileProtocol,
): boolean => {
  const expiryDate = new Date(Number(expiry) * 1000)
  const now = new Date()
  return now >= expiryDate && now < getGraceEndDate(expiryDate, protocol)
}

const getV1GraceOwner = ResultFn(async function* (
  client: Client<Transport, typeof sepoliaWithEns>,
  name: string,
  registryOwner: Address | null | undefined,
) {
  if (registryOwner && isAddressEqual(registryOwner, NAME_WRAPPER)) {
    const [wrappedOwner] = yield* fromPromise(
      readContract(client, {
        address: NAME_WRAPPER,
        abi: nameWrapperGetDataSnippet,
        functionName: 'getData',
        args: [BigInt(namehash(name))],
      }),
      (e) => new GetOwnerError({ cause: e }),
    )

    return ok(wrappedOwner === zeroAddress ? undefined : wrappedOwner)
  }

  const detail = yield* getNameDetail(name).mapErr(
    (cause) => new GetOwnerError({ cause }),
  )

  return ok(
    detail?.protocol === 'v1' &&
      detail.isSupported &&
      detail.owner !== zeroAddress
      ? (detail.owner ?? undefined)
      : undefined,
  )
})

const getV1ProfileOwner = ResultFn(async function* (
  client: Client<Transport, typeof sepoliaWithEns>,
  name: string,
  isEth2Ld = false,
) {
  const v1Owner = yield* fromPromise(
    ensjsv1_getOwner(client, { name }),
    (e) => new GetOwnerError({ cause: e }),
  )

  if (
    isEth2Ld &&
    v1Owner?.ownershipLevel !== 'nameWrapper' &&
    !v1Owner?.registrant
  ) {
    const expiry = yield* fromPromise(
      ensjsv1_getExpiry(client, { name, contract: 'registrar' }),
      (e) => new GetOwnerError({ cause: e }),
    )

    if (expiry && isRegistrationInGrace(expiry.expiry, 'v1')) {
      // BaseRegistrar.ownerOf reverts in grace, so ENSjs returns the registry
      // controller, which can differ from the holder of an unwrapped name.
      return ok({
        owner: yield* getV1GraceOwner(client, name, v1Owner?.owner),
        protocol: 'v1',
      } satisfies ProfileOwnerResult)
    }
  }

  if (v1Owner?.owner && v1Owner.owner !== zeroAddress) {
    return ok({
      owner: v1Owner.owner,
      protocol: 'v1',
    } satisfies ProfileOwnerResult)
  }

  return ok(null)
})

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

    return ok(yield* getV1ProfileOwner(client, dnsName))
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
    // Active ownership disappears at expiry. Read retained ownership directly:
    // the indexer may omit the name or its owner during grace.
    const state = yield* fromPromise(
      readContract(client, {
        address: ENS_REGISTRY,
        abi: permissionedRegistryGetStateSnippet,
        functionName: 'getState',
        args: [BigInt(labelhash(ethName.leafLabel))],
      }),
      (e) => new GetOwnerError({ cause: e }),
    )

    // Ownerless V1 reservations must keep the V1 renewal path. A retained V2
    // owner identifies a V2 registration even after its grace period ends.
    if (state.latestOwner !== zeroAddress) {
      return ok({
        owner: isRegistrationInGrace(state.expiry, 'v2')
          ? state.latestOwner
          : undefined,
        protocol: 'v2',
      } satisfies ProfileOwnerResult)
    }
  }

  return ok(
    yield* getV1ProfileOwner(
      client,
      ethName.name,
      ethName.parentLabelsRootFirst.length === 0,
    ),
  )
})

export const profileOwnerQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'owner', { name }),
    queryFn: () => getOwner({ name }),
  })
