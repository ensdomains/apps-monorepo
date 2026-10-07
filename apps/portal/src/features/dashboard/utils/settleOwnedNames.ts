import type { NameWithRelation } from '@ensdomains/ensjs/subgraph'
import {
  GRACE_PERIOD_DAYS,
  MS_PER_DAY,
} from '@/features/renew/utils/nameExtension'
import {
  getV1ExpiryDate,
  getV2ExpiryDate,
  mergeNamesData,
  type V2NameWithRoles,
} from '@/utils/names/mergeNamesData'

type OwnedNamesSource<TName> = {
  readonly names: readonly TName[]
  readonly hasMore: boolean
}

const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * MS_PER_DAY

const isV1EthName = (name: NameWithRelation) => name.parentName === 'eth'

const toTime = (expiryDate: Date | null | undefined) =>
  expiryDate?.getTime() ?? Number.POSITIVE_INFINITY

const getV1Expiry = (name: NameWithRelation) => toTime(getV1ExpiryDate(name))

const getV2Expiry = (name: V2NameWithRoles) => toTime(getV2ExpiryDate(name))

/** Where the subgraph sorts an ENSv1 name: .eth names by the end of their grace period. */
const getV1PagingTime = (name: NameWithRelation) =>
  getV1Expiry(name) + (isV1EthName(name) ? GRACE_PERIOD_MS : 0)

/** Unloaded names of a source expire at or after this; undefined once it has ended. */
const getUnloadedFrom = <TName>(
  { names, hasMore }: OwnedNamesSource<TName>,
  getExpiry: (name: TName) => number,
) => {
  const last = names.at(-1)
  if (!hasMore) return undefined
  return last === undefined ? Number.NEGATIVE_INFINITY : getExpiry(last)
}

/**
 * Merges the loaded pages by expiry, leaving out the names a later page could
 * still be sorted ahead of, so that loading more only ever adds to the end.
 */
export const settleOwnedNames = ({
  v1,
  v2,
}: {
  readonly v1: OwnedNamesSource<NameWithRelation>
  readonly v2: OwnedNamesSource<V2NameWithRoles>
}) => {
  // An unloaded .eth name expires a grace period before the point it is paged at.
  const v1UnloadedFrom = getUnloadedFrom(
    v1,
    (name) => getV1PagingTime(name) - GRACE_PERIOD_MS,
  )
  const v2UnloadedFrom = getUnloadedFrom(v2, getV2Expiry)

  const isBeforeUnloadedV1 = (expiry: number) =>
    v1UnloadedFrom === undefined || expiry < v1UnloadedFrom
  const isBeforeUnloadedV2 = (expiry: number) =>
    v2UnloadedFrom === undefined || expiry <= v2UnloadedFrom

  return mergeNamesData(
    v1.names.filter(
      (name) =>
        isBeforeUnloadedV2(getV1Expiry(name)) &&
        (isV1EthName(name) ||
          name.expiryDate === null ||
          isBeforeUnloadedV1(getV1Expiry(name))),
    ),
    v2.names.filter((name) => isBeforeUnloadedV1(getV2Expiry(name))),
  )
}
