import type { NameRelation } from '../reads/common.types'
import type { NameDetail } from '../reads/nameDetail.types'
import type { Subname, WrapperState } from '../reads/names.types'
import type { NameSummary } from '../reads/namesForAddress.types'
import type { BoundName } from '../reads/registry.types'
import { toRegistrationStatus } from '../shared/status'
import {
  secondsToBigint,
  secondsToDate,
  toAccount,
  toHash,
} from '../shared/values'
import type { V1Domain } from './ensnode.types'

/** What an ENSv1 row needs besides itself. */
export type V1Context = Readonly<{
  now: Date
  /** The chain's NameWrapper, which owns a wrapped name in the registry. */
  nameWrapper: string
}>

type Holders = Pick<V1Domain, 'owner' | 'registrant' | 'wrappedOwner'>

/** Wrapped only while the registry owner is the NameWrapper; the subgraph keeps a stale wrapper token otherwise. */
const isWrapped = (domain: Holders, nameWrapper: string) =>
  domain.owner.id.toLowerCase() === nameWrapper.toLowerCase()

/** The owner as bigname reports it: the wrapper token holder, else the registrant, else the registry owner. */
const toOwner = (domain: Holders, nameWrapper: string) =>
  isWrapped(domain, nameWrapper)
    ? toAccount(domain.wrappedOwner?.id)
    : (toAccount(domain.registrant?.id) ?? toAccount(domain.owner.id))

// A wrapped name is managed through the NameWrapper token; bigname reports its holder.
const toManager = (domain: Holders, nameWrapper: string) =>
  isWrapped(domain, nameWrapper)
    ? toAccount(domain.wrappedOwner?.id)
    : toAccount(domain.owner.id)

// A wrapped name's BaseRegistrar token belongs to the NameWrapper, not to an account.
const toRegistrant = (domain: Holders, nameWrapper: string) =>
  isWrapped(domain, nameWrapper) ? null : toAccount(domain.registrant?.id)

/** The lease, then the wrapper expiry of a wrapped subname; null when neither ends. */
const toExpiresAt = (domain: V1Domain, nameWrapper: string) =>
  secondsToDate(domain.registration?.expiryDate) ??
  (isWrapped(domain, nameWrapper)
    ? secondsToDate(domain.wrappedDomain?.expiryDate)
    : null)

// The subgraph's `Domain.expiryDate` of a `.eth` 2LD already adds the 90-day grace.
const toGraceEndsAt = (domain: V1Domain, nameWrapper: string) =>
  domain.registration
    ? secondsToDate(domain.expiryDate)
    : toExpiresAt(domain, nameWrapper)

const toStatus = (domain: V1Domain, { now, nameWrapper }: V1Context) =>
  toRegistrationStatus({
    isHeld: toOwner(domain, nameWrapper) !== null,
    expiresAt: toExpiresAt(domain, nameWrapper),
    graceEndsAt: toGraceEndsAt(domain, nameWrapper),
    now,
  })

/** An ENSv1 name as the profile pages render it. */
export const toV1NameDetail = (
  domain: V1Domain,
  context: V1Context,
): NameDetail => ({
  name: domain.name ?? domain.id,
  displayName: domain.name ?? domain.id,
  namehash: toHash(domain.id),
  protocol: 'v1',
  isSupported: true,
  owner: toOwner(domain, context.nameWrapper),
  manager: toManager(domain, context.nameWrapper),
  registrant: toRegistrant(domain, context.nameWrapper),
  resolver: toAccount(domain.resolver?.address),
  registrationStatus: toStatus(domain, context),
  expiresAt: toExpiresAt(domain, context.nameWrapper),
  graceEndsAt: toGraceEndsAt(domain, context.nameWrapper),
  registeredAt: secondsToDate(domain.registration?.registrationDate),
  registrationId: null,
  createdAt: secondsToDate(domain.createdAt),
  migratedAt: null,
  unresolvableReason: null,
})

/** The relations `address` holds to an ENSv1 name. */
export const toV1Relations = (
  domain: V1Domain,
  address: string,
  nameWrapper: string,
): readonly NameRelation[] => {
  const holder = address.toLowerCase()
  return [
    ...(toOwner(domain, nameWrapper) === holder ? (['owner'] as const) : []),
    ...(toManager(domain, nameWrapper) === holder
      ? (['manager'] as const)
      : []),
  ]
}

/** An ENSv1 name as the dashboards and address pages render it. */
export const toV1NameSummary = (
  domain: V1Domain,
  {
    address,
    includeCounts,
    includeRoles,
    ...context
  }: V1Context &
    Readonly<{
      address: string
      includeCounts?: boolean
      includeRoles?: boolean
    }>,
): NameSummary => ({
  name: domain.name ?? domain.id,
  displayName: domain.name ?? domain.id,
  namehash: toHash(domain.id),
  protocol: 'v1',
  relations: toV1Relations(domain, address, context.nameWrapper),
  isPrimary: false,
  isMigrated: false,
  registrationStatus: toStatus(domain, context),
  expiresAt: toExpiresAt(domain, context.nameWrapper),
  servedExpiry: secondsToBigint(
    domain.registration?.expiryDate ??
      (isWrapped(domain, context.nameWrapper)
        ? domain.wrappedDomain?.expiryDate
        : null),
  ),
  // Only a registrar lease has a grace.
  graceEndsAt: domain.registration ? secondsToDate(domain.expiryDate) : null,
  registeredAt: secondsToDate(domain.registration?.registrationDate),
  createdAt: secondsToDate(domain.createdAt),
  ...(includeCounts && { subnameCount: domain.subdomainCount }),
  // ENSv1 has no roles.
  ...(includeRoles && { heldPowers: [] }),
})

// NameWrapper fuses: CANNOT_UNWRAP locks the name, PARENT_CANNOT_CONTROL emancipates it.
const CANNOT_UNWRAP = 1
const PARENT_CANNOT_CONTROL = 65536

const toWrapperState = (fuses: number): WrapperState =>
  fuses & CANNOT_UNWRAP
    ? 'locked'
    : fuses & PARENT_CANNOT_CONTROL
      ? 'emancipated'
      : 'wrapped'

const UNWRAPPED: NonNullable<Subname['wrapper']> = {
  state: 'unwrapped',
  fuses: 0,
  parentCannotControl: false,
  expiresAt: null,
}

const toWrapper = (domain: V1Domain, nameWrapper: string) =>
  domain.wrappedDomain && isWrapped(domain, nameWrapper)
    ? {
        state: toWrapperState(domain.wrappedDomain.fuses),
        fuses: domain.wrappedDomain.fuses,
        parentCannotControl: !!(
          domain.wrappedDomain.fuses & PARENT_CANNOT_CONTROL
        ),
        expiresAt: secondsToDate(domain.wrappedDomain.expiryDate),
      }
    : UNWRAPPED

/** An ENSv1 child as the subnames lists render it. */
export const toV1Subname = (
  domain: V1Domain,
  {
    includeCounts,
    ...context
  }: V1Context & Readonly<{ includeCounts?: boolean }>,
): Subname => ({
  name: domain.name ?? domain.id,
  displayName: domain.name ?? domain.id,
  namehash: toHash(domain.id),
  labelhash: domain.labelhash ? toHash(domain.labelhash) : null,
  owner: toOwner(domain, context.nameWrapper),
  protocol: 'v1',
  registrationStatus: toStatus(domain, context),
  expiresAt: toExpiresAt(domain, context.nameWrapper),
  wrapper: toWrapper(domain, context.nameWrapper),
  ...(includeCounts && { subnameCount: domain.subdomainCount }),
})

/** A name pointing at a resolver, if it still does. */
export const toV1BoundName = (
  domain: Holders & Pick<V1Domain, 'id' | 'name' | 'resolver'>,
  resolver: string,
  nameWrapper: string,
): BoundName | null =>
  domain.resolver?.address.toLowerCase() === resolver.toLowerCase()
    ? {
        name: domain.name ?? domain.id,
        namehash: toHash(domain.id),
        owner: toOwner(domain, nameWrapper),
      }
    : null
