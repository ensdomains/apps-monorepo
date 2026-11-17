import type { V1Domain } from '../ensnode/ensnode.types'
import { toV1NameDetail, type V1Context } from '../ensnode/names'
import type { NameRelation } from '../reads/common.types'
import type { NameDetail } from '../reads/nameDetail.types'
import type { Subname } from '../reads/names.types'
import type { NameSummary } from '../reads/namesForAddress.types'
import { toRegistrationStatus } from '../shared/status'
import {
  addMs,
  isEth2ld,
  secondsToBigint,
  secondsToDate,
  toAccount,
  toHash,
  V2_GRACE_MS,
} from '../shared/values'
import type { V2Domain } from './zigens.types'

const toName = (domain: V2Domain) => domain.name ?? domain.id

// zigens serves the ENSIP-15 form; bigname's display name is the same for a normalized name.
const toDisplayName = (domain: V2Domain) =>
  domain.normalizedName ?? toName(domain)

/** Only a `.eth` 2LD has a registrar grace; anything else ends at its expiry. */
const toGraceEndsAt = (domain: V2Domain) => {
  const expiresAt = secondsToDate(domain.expiryDate)
  return isEth2ld(toName(domain)) ? addMs(expiresAt, V2_GRACE_MS) : expiresAt
}

const toStatus = (domain: V2Domain, now: Date) =>
  toRegistrationStatus({
    isHeld: toAccount(domain.owner.id) !== null,
    expiresAt: secondsToDate(domain.expiryDate),
    graceEndsAt: toGraceEndsAt(domain),
    now,
  })

/** A registered ENSv2 row; a migration reservation has no owner and the name still answers from ENSv1. */
export const isRegisteredV2 = (
  domain: Pick<V2Domain, 'protocol' | 'owner'>,
): boolean => domain.protocol === 'v2' && toAccount(domain.owner.id) !== null

/** An ENSv2 name as the profile pages render it. */
export const toV2NameDetail = (domain: V2Domain, now: Date): NameDetail => ({
  name: toName(domain),
  displayName: toDisplayName(domain),
  namehash: toHash(domain.id),
  protocol: 'v2',
  isSupported: true,
  owner: toAccount(domain.owner.id),
  // As bigname reports it: ENSv2 has no registry manager, so the owner manages.
  manager: toAccount(domain.owner.id),
  // The BaseRegistrar registrant is an ENSv1 notion.
  registrant: null,
  resolver: toAccount(domain.resolver?.address),
  registrationStatus: toStatus(domain, now),
  expiresAt: secondsToDate(domain.expiryDate),
  graceEndsAt: toGraceEndsAt(domain),
  registeredAt: secondsToDate(domain.registrationDate),
  // The versioned token id: a re-registration mints a new one.
  registrationId: domain.tokenId,
  createdAt: secondsToDate(domain.createdAt),
  migratedAt: null,
  unresolvableReason: null,
})

type SummaryContext = Readonly<{
  address: string
  now: Date
  /** Names `address` holds a label role on, with the powers it holds there. */
  powersByName: ReadonlyMap<string, readonly string[]>
  includeCounts?: boolean
  includeRoles?: boolean
}>

const toV2Relations = (
  domain: V2Domain,
  { address, powersByName }: SummaryContext,
): readonly NameRelation[] => [
  ...(toAccount(domain.owner.id) === address.toLowerCase()
    ? (['owner', 'manager'] as const)
    : []),
  ...(powersByName.has(toName(domain)) ? (['role_holder'] as const) : []),
]

/** An ENSv2 name as the dashboards and address pages render it. */
export const toV2NameSummary = (
  domain: V2Domain,
  context: SummaryContext,
): NameSummary => ({
  name: toName(domain),
  displayName: toDisplayName(domain),
  namehash: toHash(domain.id),
  protocol: 'v2',
  relations: toV2Relations(domain, context),
  isPrimary: false,
  isMigrated: domain.isMigrated,
  registrationStatus: toStatus(domain, context.now),
  expiresAt: secondsToDate(domain.expiryDate),
  servedExpiry: secondsToBigint(domain.expiryDate),
  graceEndsAt: isEth2ld(toName(domain)) ? toGraceEndsAt(domain) : null,
  registeredAt: secondsToDate(domain.registrationDate),
  createdAt: secondsToDate(domain.createdAt),
  ...(context.includeCounts && { subnameCount: domain.subdomainCount }),
  ...(context.includeRoles && {
    heldPowers: context.powersByName.get(toName(domain)) ?? [],
  }),
})

/** A detail from whichever deployment answers for the name. */
export const pickNameDetail = (
  v2: V2Domain | undefined,
  v1: V1Domain | undefined,
  context: V1Context,
): NameDetail | null => {
  if (v2 && isRegisteredV2(v2)) return toV2NameDetail(v2, context.now)
  if (v1) return toV1NameDetail(v1, context)
  return v2 ? toV2NameDetail(v2, context.now) : null
}

/** An ENSv2 child as the subnames lists render it. */
export const toV2Subname = (
  domain: V2Domain,
  { now, includeCounts }: Readonly<{ now: Date; includeCounts?: boolean }>,
): Subname => ({
  name: toName(domain),
  displayName: toDisplayName(domain),
  namehash: toHash(domain.id),
  labelhash: toHash(domain.labelhash),
  owner: toAccount(domain.owner.id),
  protocol: 'v2',
  registrationStatus: toStatus(domain, now),
  expiresAt: secondsToDate(domain.expiryDate),
  wrapper: null,
  ...(includeCounts && { subnameCount: domain.subdomainCount }),
})
