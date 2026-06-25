import { type Address, isAddress } from 'viem'
import {
  getGraceEndDate,
  isInGracePeriod,
} from '@/features/grace/utils/gracePeriod'
import { isKnownPublicResolver } from '../contracts/knownResolvers'
import { getV1GraceRenewalDurationSeconds } from './graceRenewal'
import type { V1Domain } from './v1SubgraphClient'

const toAddress = (s: string | null | undefined): Address | null => {
  if (!s) return null
  return isAddress(s) ? (s as Address) : null
}

export const FUSES = {
  CAN_DO_EVERYTHING: 0,
  CANNOT_UNWRAP: 1,
  CANNOT_BURN_FUSES: 2,
  CANNOT_TRANSFER: 4,
  CANNOT_SET_RESOLVER: 8,
  CANNOT_SET_TTL: 16,
  CANNOT_CREATE_SUBDOMAIN: 32,
  CANNOT_APPROVE: 64,
  PARENT_CANNOT_CONTROL: 1 << 16,
  IS_DOT_ETH: 1 << 17,
  CAN_EXTEND_EXPIRY: 1 << 18,
} as const

export type MigrationTokenType =
  | 'unwrapped'
  | 'unlocked'
  | 'locked-2ld'
  | 'locked-child'
  | 'detached-child'

export type IneligibleReason =
  | 'unlocked-subname'
  | 'expired-registration'
  | 'registry-only'
  | 'not-transferable'
  | 'missing-parent'
  | 'frozen-approval'
  | 'already-migrated'
  | 'unknown-label'

export type IneligibleName = {
  readonly domain: V1Domain
  readonly reason: IneligibleReason
}

type ResolverStrategy = 'keep-v1' | 'to-owned-permres'

export type ClassifiedName = {
  readonly domain: V1Domain
  readonly tokenType: MigrationTokenType
  readonly label: string
  readonly parentName: string | null
  readonly fuses: number
  readonly tokenHolder: Address
  readonly v1ResolverAddress: string | null
  readonly resolverStrategy: ResolverStrategy
  readonly managerAddress: Address | null
}

export type RenewableGraceName = ClassifiedName & {
  readonly renewalStatus: 'renewable-grace'
  readonly registrationExpiryDate: Date
  readonly graceEndDate: Date
  readonly renewalDurationSeconds: number
}

export const hasFuse = (fuses: number, fuse: number): boolean =>
  (fuses & fuse) !== 0

export const is2LD = (name: ClassifiedName): boolean =>
  name.tokenType === 'unwrapped' ||
  name.tokenType === 'unlocked' ||
  name.tokenType === 'locked-2ld'

const resolverStrategyFor = (params: {
  tokenType: MigrationTokenType
  fuses: number
  v1ResolverAddress: string | null
}): ResolverStrategy => {
  const { tokenType, fuses, v1ResolverAddress } = params

  const cannotSetResolverLocked =
    (tokenType === 'locked-2ld' || tokenType === 'locked-child') &&
    hasFuse(fuses, FUSES.CANNOT_SET_RESOLVER)

  if (cannotSetResolverLocked && v1ResolverAddress) {
    return 'keep-v1'
  }

  if (v1ResolverAddress && !isKnownPublicResolver(v1ResolverAddress)) {
    return 'keep-v1'
  }

  return 'to-owned-permres'
}

type ClassifyResult =
  | { type: 'classified'; name: ClassifiedName }
  | { type: 'renewableGrace'; name: RenewableGraceName }
  | { type: 'ineligible'; name: IneligibleName }
  | null

const UNKNOWN_LABEL_PATTERN = /\[[0-9a-fA-F]{64}\]/
const hasUnknownLabel = (domain: V1Domain): boolean => {
  if (!domain.labelName) return true
  if (UNKNOWN_LABEL_PATTERN.test(domain.labelName)) return true
  if (UNKNOWN_LABEL_PATTERN.test(domain.name)) return true
  return false
}

const isWrapActive = (
  wrappedDomain: V1Domain['wrappedDomain'],
  nowSeconds: bigint,
): boolean => {
  if (!wrappedDomain) return false
  return BigInt(wrappedDomain.expiryDate) > nowSeconds
}

const getDotEthRegistrationExpiry = (
  domain: V1Domain,
  parentName: string | null,
): Date | null => {
  if (parentName !== 'eth') return null
  const expiryDate = domain.registration?.expiryDate
  if (!expiryDate) return null
  const seconds = Number(expiryDate)
  if (!Number.isFinite(seconds)) return null
  return new Date(seconds * 1000)
}

const isExpired = (expiryDate: Date, now: Date): boolean =>
  expiryDate.getTime() <= now.getTime()

const makeRenewableGraceName = (params: {
  readonly domain: V1Domain
  readonly label: string
  readonly parentName: string | null
  readonly tokenHolder: Address
  readonly v1ResolverAddress: string | null
  readonly managerAddress: Address | null
  readonly registrationExpiryDate: Date
  readonly now: Date
}): RenewableGraceName => ({
  domain: params.domain,
  tokenType: 'unwrapped',
  label: params.label,
  parentName: params.parentName,
  fuses: 0,
  tokenHolder: params.tokenHolder,
  v1ResolverAddress: params.v1ResolverAddress,
  resolverStrategy: resolverStrategyFor({
    tokenType: 'unwrapped',
    fuses: 0,
    v1ResolverAddress: params.v1ResolverAddress,
  }),
  managerAddress: params.managerAddress,
  renewalStatus: 'renewable-grace',
  registrationExpiryDate: params.registrationExpiryDate,
  graceEndDate: getGraceEndDate(params.registrationExpiryDate, false),
  renewalDurationSeconds: getV1GraceRenewalDurationSeconds(
    params.registrationExpiryDate,
    params.now,
  ),
})

const makeClassifiedResult = (params: {
  readonly domain: V1Domain
  readonly tokenType: MigrationTokenType
  readonly label: string
  readonly parentName: string | null
  readonly fuses: number
  readonly tokenHolder: Address
  readonly v1ResolverAddress: string | null
  readonly managerAddress: Address | null
}): ClassifyResult => ({
  type: 'classified',
  name: {
    domain: params.domain,
    tokenType: params.tokenType,
    label: params.label,
    parentName: params.parentName,
    fuses: params.fuses,
    tokenHolder: params.tokenHolder,
    v1ResolverAddress: params.v1ResolverAddress,
    resolverStrategy: resolverStrategyFor({
      tokenType: params.tokenType,
      fuses: params.fuses,
      v1ResolverAddress: params.v1ResolverAddress,
    }),
    managerAddress: params.managerAddress,
  },
})

const classifyExpiredRegistration = (params: {
  readonly domain: V1Domain
  readonly label: string
  readonly parentName: string | null
  readonly tokenHolder: Address
  readonly v1ResolverAddress: string | null
  readonly managerAddress: Address | null
  readonly now: Date
}): ClassifyResult => {
  const registrationExpiryDate = getDotEthRegistrationExpiry(
    params.domain,
    params.parentName,
  )
  if (
    !registrationExpiryDate ||
    !isExpired(registrationExpiryDate, params.now)
  ) {
    return null
  }
  if (isInGracePeriod(registrationExpiryDate, false, params.now)) {
    return {
      type: 'renewableGrace',
      name: makeRenewableGraceName({
        domain: params.domain,
        label: params.label,
        parentName: params.parentName,
        tokenHolder: params.tokenHolder,
        v1ResolverAddress: params.v1ResolverAddress,
        managerAddress: params.managerAddress,
        registrationExpiryDate,
        now: params.now,
      }),
    }
  }
  return {
    type: 'ineligible',
    name: { domain: params.domain, reason: 'expired-registration' },
  }
}

const classifyUnwrappedDomain = (params: {
  readonly domain: V1Domain
  readonly label: string
  readonly parentName: string | null
  readonly addr: string
  readonly v1ResolverAddress: string | null
  readonly now: Date
}): ClassifyResult => {
  const { addr, domain, label, now, parentName, v1ResolverAddress } = params
  const registrant = domain.registrant
  if (registrant?.id.toLowerCase() !== addr) return null
  if (parentName !== 'eth') return null

  const tokenHolder = toAddress(registrant.id)
  if (!tokenHolder) return null

  const registryOwnerAddress = toAddress(domain.owner.id)
  const managerAddress: Address | null =
    registryOwnerAddress &&
    registryOwnerAddress.toLowerCase() !== registrant.id.toLowerCase()
      ? registryOwnerAddress
      : null
  const expiredRegistration = classifyExpiredRegistration({
    domain,
    label,
    parentName,
    tokenHolder,
    v1ResolverAddress,
    managerAddress,
    now,
  })
  if (expiredRegistration) return expiredRegistration

  return makeClassifiedResult({
    domain,
    tokenType: 'unwrapped',
    label,
    parentName,
    fuses: 0,
    tokenHolder,
    v1ResolverAddress,
    managerAddress,
  })
}

const isDetachedChildCandidate = (
  domain: V1Domain,
  parentName: string | null,
  fuses: number,
): boolean =>
  !!parentName &&
  hasFuse(fuses, FUSES.PARENT_CANNOT_CONTROL) &&
  !!domain.parent?.wrappedDomain &&
  hasFuse(domain.parent.wrappedDomain.fuses, FUSES.CANNOT_UNWRAP)

const classifyUnlockedWrappedDomain = (params: {
  readonly domain: V1Domain
  readonly label: string
  readonly parentName: string | null
  readonly fuses: number
  readonly tokenHolder: Address
  readonly v1ResolverAddress: string | null
}): ClassifyResult => {
  const { domain, fuses, label, parentName, tokenHolder, v1ResolverAddress } =
    params
  if (parentName === 'eth') {
    return makeClassifiedResult({
      domain,
      tokenType: 'unlocked',
      label,
      parentName,
      fuses,
      tokenHolder,
      v1ResolverAddress,
      managerAddress: null,
    })
  }
  if (isDetachedChildCandidate(domain, parentName, fuses)) {
    return makeClassifiedResult({
      domain,
      tokenType: 'detached-child',
      label,
      parentName,
      fuses,
      tokenHolder,
      v1ResolverAddress,
      managerAddress: null,
    })
  }
  return {
    type: 'ineligible',
    name: { domain, reason: 'unlocked-subname' },
  }
}

const classifyWrappedDomain = (params: {
  readonly domain: V1Domain
  readonly label: string
  readonly parentName: string | null
  readonly wrappedDomain: NonNullable<V1Domain['wrappedDomain']>
  readonly wrappedOwnerMatches: boolean
  readonly v1ResolverAddress: string | null
  readonly now: Date
}): ClassifyResult => {
  const {
    domain,
    label,
    now,
    parentName,
    v1ResolverAddress,
    wrappedDomain,
    wrappedOwnerMatches,
  } = params
  const wrappedOwner = domain.wrappedOwner
  if (!wrappedOwner || !wrappedOwnerMatches) return null

  const fuses = wrappedDomain.fuses
  const wrappedHolder = toAddress(wrappedOwner.id)
  if (!wrappedHolder) return null

  const expiredRegistration = classifyExpiredRegistration({
    domain,
    label,
    parentName,
    tokenHolder: wrappedHolder,
    v1ResolverAddress,
    managerAddress: null,
    now,
  })
  if (expiredRegistration) return expiredRegistration

  if (!hasFuse(fuses, FUSES.CANNOT_UNWRAP)) {
    return classifyUnlockedWrappedDomain({
      domain,
      label,
      parentName,
      fuses,
      tokenHolder: wrappedHolder,
      v1ResolverAddress,
    })
  }
  if (hasFuse(fuses, FUSES.CANNOT_TRANSFER)) {
    return { type: 'ineligible', name: { domain, reason: 'not-transferable' } }
  }
  if (!parentName) {
    return { type: 'ineligible', name: { domain, reason: 'missing-parent' } }
  }

  return makeClassifiedResult({
    domain,
    tokenType: parentName === 'eth' ? 'locked-2ld' : 'locked-child',
    label,
    parentName,
    fuses,
    tokenHolder: wrappedHolder,
    v1ResolverAddress,
    managerAddress: null,
  })
}

export const classifyName = (
  domain: V1Domain,
  ownerAddress: Address,
): ClassifyResult => {
  if (hasUnknownLabel(domain)) {
    return { type: 'ineligible', name: { domain, reason: 'unknown-label' } }
  }
  const label = domain.labelName
  if (!label) return null

  const parentName = domain.parent?.name ?? null
  const addr = ownerAddress.toLowerCase()
  const v1ResolverAddress = domain.resolver?.address ?? null
  const now = new Date()
  const nowSeconds = BigInt(Math.floor(now.getTime() / 1000))
  const wrappedOwnerMatches = domain.wrappedOwner?.id.toLowerCase() === addr
  const effectiveWrappedDomain =
    domain.wrappedDomain &&
    (isWrapActive(domain.wrappedDomain, nowSeconds) || wrappedOwnerMatches)
      ? domain.wrappedDomain
      : null

  if (!effectiveWrappedDomain) {
    return classifyUnwrappedDomain({
      domain,
      label,
      parentName,
      addr,
      v1ResolverAddress,
      now,
    })
  }

  return classifyWrappedDomain({
    domain,
    label,
    parentName,
    wrappedDomain: effectiveWrappedDomain,
    wrappedOwnerMatches,
    v1ResolverAddress,
    now,
  })
}

export type ClassifyNamesResult = {
  readonly classified: ClassifiedName[]
  readonly renewableGrace: RenewableGraceName[]
  readonly ineligible: IneligibleName[]
}

export const classifyNames = (
  domains: V1Domain[],
  ownerAddress: Address,
): ClassifyNamesResult => {
  const classified: ClassifiedName[] = []
  const renewableGrace: RenewableGraceName[] = []
  const ineligible: IneligibleName[] = []

  for (const domain of domains) {
    const result = classifyName(domain, ownerAddress)
    if (!result) continue
    if (result.type === 'classified') {
      classified.push(result.name)
    } else if (result.type === 'renewableGrace') {
      renewableGrace.push(result.name)
    } else {
      ineligible.push(result.name)
    }
  }

  return { classified, renewableGrace, ineligible }
}

export type GroupedNames = {
  readonly unwrapped: readonly ClassifiedName[]
  readonly unlocked: readonly ClassifiedName[]
  readonly locked2ld: readonly ClassifiedName[]
  readonly childNames: ReadonlyMap<string, readonly ClassifiedName[]>
}

export const groupClassifiedNames = (names: ClassifiedName[]): GroupedNames => {
  const unwrapped: ClassifiedName[] = []
  const unlocked: ClassifiedName[] = []
  const locked2ld: ClassifiedName[] = []
  const childNames = new Map<string, ClassifiedName[]>()

  for (const name of names) {
    switch (name.tokenType) {
      case 'unwrapped':
        unwrapped.push(name)
        break
      case 'unlocked':
        unlocked.push(name)
        break
      case 'locked-2ld':
        locked2ld.push(name)
        break
      case 'locked-child':
      case 'detached-child': {
        const parent = name.parentName
        if (!parent) break
        const existing = childNames.get(parent) ?? []
        existing.push(name)
        childNames.set(parent, existing)
        break
      }
    }
  }

  return { unwrapped, unlocked, locked2ld, childNames }
}
