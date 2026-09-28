import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import type { QueryClient } from '@tanstack/react-query'
import type { V1Domain } from './v1SubgraphClient'

export type ConfirmedRenewal = {
  readonly domain: V1Domain
  readonly expiry: bigint
  readonly wrapperExpiry: bigint | null
}

// Keep confirmations scoped to a QueryClient, including during SSR. Entries
// disappear when indexing catches up or the confirmed registration expires.
const confirmedRenewals = new WeakMap<
  QueryClient,
  ReadonlyMap<string, ConfirmedRenewal>
>()

const hasSameOwnership = (domain: V1Domain, previous: V1Domain): boolean =>
  domain.owner.id.toLowerCase() === previous.owner.id.toLowerCase() &&
  domain.registrant?.id.toLowerCase() ===
    previous.registrant?.id.toLowerCase() &&
  domain.wrappedOwner?.id.toLowerCase() ===
    previous.wrappedOwner?.id.toLowerCase() &&
  domain.wrappedDomain?.fuses === previous.wrappedDomain?.fuses

const hasIndexedRenewal = (
  domain: V1Domain,
  renewal: ConfirmedRenewal,
): boolean =>
  BigInt(domain.registration?.expiryDate ?? '0') >= renewal.expiry &&
  (!domain.wrappedDomain ||
    BigInt(domain.wrappedDomain.expiryDate) >= (renewal.wrapperExpiry ?? 0n))

const applyRenewal = (
  domain: V1Domain,
  renewal: ConfirmedRenewal | undefined,
): V1Domain => {
  if (!renewal || !hasSameOwnership(domain, renewal.domain)) return domain

  return {
    ...domain,
    registration: {
      expiryDate: (BigInt(domain.registration?.expiryDate ?? '0') >
      renewal.expiry
        ? BigInt(domain.registration?.expiryDate ?? '0')
        : renewal.expiry
      ).toString(),
    },
    wrappedDomain: domain.wrappedDomain
      ? {
          ...domain.wrappedDomain,
          expiryDate: (BigInt(domain.wrappedDomain.expiryDate) >
          (renewal.wrapperExpiry ?? 0n)
            ? BigInt(domain.wrappedDomain.expiryDate)
            : (renewal.wrapperExpiry ?? 0n)
          ).toString(),
        }
      : null,
  }
}

export const reconcileRenewedV1Names = (
  queryClient: QueryClient,
  domains: V1Domain[],
): V1Domain[] => {
  const confirmations = confirmedRenewals.get(queryClient)
  if (!confirmations?.size) return domains

  const nowSeconds = BigInt(Math.floor(Date.now() / 1000))
  const remaining = new Map(
    [...confirmations].filter(([, renewal]) => renewal.expiry > nowSeconds),
  )
  const reconciled = domains.map((domain) => {
    const renewal = remaining.get(domain.name)
    if (!renewal || !hasSameOwnership(domain, renewal.domain)) return domain
    if (hasIndexedRenewal(domain, renewal)) {
      remaining.delete(domain.name)
      return domain
    }
    return applyRenewal(domain, renewal)
  })
  confirmedRenewals.set(queryClient, remaining)
  return reconciled
}

export const recordConfirmedV1Renewal = (
  queryClient: QueryClient,
  renewal: ConfirmedRenewal,
): void => {
  confirmedRenewals.set(
    queryClient,
    new Map([
      ...(confirmedRenewals.get(queryClient) ?? []),
      [renewal.domain.name, renewal],
    ]),
  )
  queryClient.setQueriesData<V1Domain[]>(
    { queryKey: qk('migration', 'v1_names') },
    (domains) =>
      domains?.map((entry) =>
        entry.name === renewal.domain.name
          ? applyRenewal(entry, renewal)
          : entry,
      ),
  )
}
