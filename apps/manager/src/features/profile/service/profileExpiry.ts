import { isNameProfile, timestampToBigInt } from '@ens-apps/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  getExpiry as ensjsv2_getExpiry,
  type GetExpiryErrorType as GetV2ExpiryErrorType,
} from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import {
  getNameExpiryStatus,
  getSubnameExpiryStatus,
  type NameExpiryStatus,
} from '@/features/grace/utils/gracePeriod'
import type { RenewalProtocol } from '@/features/renew/utils/renewalProtocol'
import { bigname } from '@/lib/bigname'
import { sepoliaWithEns } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { normalizeEth2LdName, normalizeEthName } from './profileName'
import { getOwner, type ProfileProtocol } from './profileOwner'

export const profileExpiryDateFromSeconds = (
  expirySeconds: number | bigint | null | undefined,
): Date | null => {
  if (expirySeconds == null) return null
  const date = new Date(Number(expirySeconds) * 1000)
  return Number.isNaN(date.getTime()) ? null : date
}

export const getProfileNameExpiryStatus = (
  expirySeconds: number | bigint | null | undefined,
  protocol: RenewalProtocol,
): NameExpiryStatus =>
  getNameExpiryStatus(profileExpiryDateFromSeconds(expirySeconds), protocol)

export type ProfileExpiryResult = {
  readonly expiry: bigint | null
  readonly isNonExpiring: boolean
  readonly protocol: 'v1' | 'v2'
  readonly isSubname?: boolean
}

export const getProfileExpiryResultStatus = (
  expiry: ProfileExpiryResult | null | undefined,
): NameExpiryStatus =>
  expiry?.isSubname
    ? getSubnameExpiryStatus(profileExpiryDateFromSeconds(expiry.expiry))
    : getProfileNameExpiryStatus(expiry?.expiry, expiry?.protocol ?? 'v2')

class GetProfileExpiryError extends TaggedError('GetProfileExpiryError')<{
  cause: unknown
}> {}

const ENS_REGISTRY = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensRegistry',
})

/**
 * An ENSv1 `.eth` 2LD's BaseRegistrar lease, as bigname serves it in
 * `ens_v1.expires_at`. The top-level `expires_at` of such a name is its ENSv2
 * reservation's from the Universal Resolver cutover, so it is not read here;
 * the ENSv1 grace (90 days) is added to the lease by `getNameExpiryStatus`.
 * A name bigname does not know (404) or serves without a lease answers null.
 */
const getV1LeaseExpiry = async (name: string): Promise<bigint | null> => {
  const detail = await bigname.getName(name)
  if (!detail || !isNameProfile(detail.data)) return null
  return timestampToBigInt(detail.data.ens_v1?.expires_at) ?? null
}

/**
 * A subname's own expiry, as its registry records it.
 *
 * It lives in its parent's subregistry, which the profile has no address for,
 * so this reads the indexer. Deliberately not bounded by the ancestors: a v2
 * label carries its own expiry, and a detached or custom subregistry can
 * outlive its parent, so a computed minimum would report a date no registry
 * holds. A subname has no ENSv1 lease, so its top-level `expires_at` is its
 * own (for a wrapped ENSv1 subname, the NameWrapper entry's). bigname serves
 * `null` with `expires_at_reason` when none is set (a parent that set no
 * wrapper expiry, a v2 max expiry); that and any failure answer null and
 * render as no expiry. Released and expired subnames are still served.
 */
const getIndexedExpiry = async (name: string): Promise<bigint | null> => {
  try {
    const detail = await bigname.getName(name)
    if (!detail || !isNameProfile(detail.data)) return null
    return timestampToBigInt(detail.data.expires_at) ?? null
  } catch {
    return null
  }
}

export const getExpiry = ResultFn(async function* (
  name: string,
  protocol?: ProfileProtocol,
) {
  const subname = normalizeEthName(name)

  if (subname && subname.parentLabelsRootFirst.length > 0) {
    const expiry = await getIndexedExpiry(subname.name)

    return ok({
      expiry,
      isNonExpiring: false,
      protocol: 'v2',
      isSubname: true,
    } satisfies ProfileExpiryResult)
  }

  const ethName = normalizeEth2LdName(name)

  if (!ethName) {
    return ok({
      expiry: null,
      isNonExpiring: false,
      protocol: 'v2',
    } satisfies ProfileExpiryResult)
  }

  const ownerRecord = protocol ? null : yield* getOwner({ name: ethName.name })
  const resolvedProtocol = protocol ?? ownerRecord?.protocol ?? 'v2'

  if (resolvedProtocol === 'v1') {
    const leaseExpiry = yield* fromPromise(
      getV1LeaseExpiry(ethName.name),
      (e) => new GetProfileExpiryError({ cause: e }),
    )

    return ok({
      expiry: leaseExpiry,
      isNonExpiring: false,
      protocol: 'v1',
    } satisfies ProfileExpiryResult)
  }

  const client = yield* safeGetClient()

  const expiry = yield* fromPromise(
    ensjsv2_getExpiry(client, {
      name: ethName.name,
      registryAddress: ENS_REGISTRY,
    }),
    (e) => new GetProfileExpiryError({ cause: e as GetV2ExpiryErrorType }),
  )

  if (expiry !== 0n) {
    return ok({
      expiry,
      isNonExpiring: false,
      protocol: 'v2',
    } satisfies ProfileExpiryResult)
  }

  // The registry reads 0 both for a label it holds no record of and for one
  // that never expires, so the owner is what separates them.
  const owner = protocol ? yield* getOwner({ name: ethName.name }) : ownerRecord

  return ok({
    expiry: null,
    isNonExpiring: !!owner?.owner,
    protocol: 'v2',
  } satisfies ProfileExpiryResult)
})

export const profileExpiryQuery = (name: string, protocol?: ProfileProtocol) =>
  resultQueryOptions({
    queryKey: qk('profile', 'expiry', { name, protocol }),
    queryFn: ({ queryKey: [{ name, protocol }] }) => getExpiry(name, protocol),
  })
