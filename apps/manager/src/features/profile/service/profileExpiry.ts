import indexerClient, { graphqlRequest } from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  getExpiry as ensjsv1_getExpiry,
  type GetExpiryErrorType as GetV1ExpiryErrorType,
  type GetExpiryReturnType as GetV1ExpiryReturnType,
} from '@ensdomains/ensjs/public/v1'
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
  cause: GetV1ExpiryErrorType | GetV2ExpiryErrorType
}> {}

const ENS_REGISTRY = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensRegistry',
})

const normalizeV1Expiry = (
  expiry: GetV1ExpiryReturnType,
): ProfileExpiryResult => {
  if (expiry?.expiry === 0n) {
    return { expiry: null, isNonExpiring: true, protocol: 'v1' }
  }

  return {
    expiry: expiry?.expiry ?? null,
    isNonExpiring: false,
    protocol: 'v1',
  }
}

// Kept as a raw string: parsing with graphql 17 at module scope opens a
// diagnostics-channel tracing span, which workerd disallows in global scope.
// `includeUnreachable` keeps an already-expired ancestor in the result, which
// is precisely the one that decides the answer.
const AncestorExpiriesDocument = /* GraphQL */ `
  query AncestorExpiries($names: [String!]!) {
    domains(where: { name_in: $names, includeUnreachable: true }) {
      name
      expiryDate
    }
  }
`

type AncestorExpiriesQuery = {
  readonly domains: readonly {
    readonly name: string | null
    readonly expiryDate: number | null
  }[]
}

/** Every name in the chain, leaf first: a.b.eth -> a.b.eth, b.eth, eth. */
const nameChain = (name: string): string[] => {
  const labels = name.split('.')
  return labels.map((_, index) => labels.slice(index).join('.'))
}

/**
 * A subname's effective expiry, which is the earliest in its chain.
 *
 * It lives in its parent's subregistry, so the profile has no address to read
 * an expiry from on chain, and it cannot outlive an ancestor: re-registering an
 * expired parent replaces the subregistry that holds it. Any failure, and a
 * leaf the indexer doesn't know, answers null and renders as no expiry.
 */
const getIndexedEffectiveExpiry = async (
  name: string,
): Promise<number | null> => {
  try {
    const { domains } = await graphqlRequest<
      AncestorExpiriesQuery,
      { names: string[] }
    >(indexerClient, AncestorExpiriesDocument, { names: nameChain(name) })

    if (!domains.some((domain) => domain.name === name)) return null

    const expiries = domains
      .map((domain) => domain.expiryDate)
      .filter((expiry): expiry is number => expiry != null)

    return expiries.length > 0 ? Math.min(...expiries) : null
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
    const expiry = await getIndexedEffectiveExpiry(subname.name)

    return ok({
      expiry: expiry === null ? null : BigInt(expiry),
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

  const client = yield* safeGetClient()

  if (resolvedProtocol === 'v1') {
    const v1Expiry = yield* fromPromise(
      ensjsv1_getExpiry(client, { name: ethName.name }),
      (e) =>
        new GetProfileExpiryError({
          cause: e as GetV1ExpiryErrorType,
        }),
    )

    return ok(normalizeV1Expiry(v1Expiry))
  }

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
