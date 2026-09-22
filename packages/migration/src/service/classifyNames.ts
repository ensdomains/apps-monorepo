import { ChildFuses, FullParentFuses } from '@ensdomains/ensjs/utils'
import { type Address, isAddress } from 'viem'
import { isKnownPublicResolver } from '../contracts/knownResolvers'
import { GRACE_PERIOD_SECONDS } from './constants'
import type { V1Domain } from './v1SubgraphClient'

const toAddress = (s: string | null | undefined): Address | null => {
  if (!s) return null
  return isAddress(s) ? (s as Address) : null
}

export const FUSES = {
  CAN_DO_EVERYTHING: 0n,
  CANNOT_UNWRAP: ChildFuses.CANNOT_UNWRAP,
  CANNOT_BURN_FUSES: ChildFuses.CANNOT_BURN_FUSES,
  CANNOT_TRANSFER: ChildFuses.CANNOT_TRANSFER,
  CANNOT_SET_RESOLVER: ChildFuses.CANNOT_SET_RESOLVER,
  CANNOT_SET_TTL: ChildFuses.CANNOT_SET_TTL,
  CANNOT_CREATE_SUBDOMAIN: ChildFuses.CANNOT_CREATE_SUBDOMAIN,
  CANNOT_APPROVE: ChildFuses.CANNOT_APPROVE,
  PARENT_CANNOT_CONTROL: FullParentFuses.PARENT_CANNOT_CONTROL,
  IS_DOT_ETH: FullParentFuses.IS_DOT_ETH,
  CAN_EXTEND_EXPIRY: FullParentFuses.CAN_EXTEND_EXPIRY,
} as const

export type MigrationTokenType =
  | 'unwrapped'
  | 'unlocked'
  | 'locked-2ld'
  | 'locked-child'
  | 'detached-child'

export type CopyTokenType = 'unlocked-child' | 'registry-child'

export type CopySource = 'name-wrapper' | 'registry'

export type IneligibleReason =
  | 'unlocked-subname'
  | 'expired-registration'
  | 'registry-only'
  | 'not-transferable'
  | 'missing-parent'
  | 'frozen-approval'
  | 'already-migrated'
  | 'unknown-label'
  | 'invalid-label'
  | 'unsupported-resolver'

export type IneligibleName = {
  readonly domain: V1Domain
  readonly reason: IneligibleReason
}

export type ResolverStrategy = 'keep-v1' | 'to-owned-permres'

type ClassifiedNameBase = {
  readonly domain: V1Domain
  readonly label: string
  readonly parentName: string | null
  readonly fuses: bigint
  readonly tokenHolder: Address
  readonly v1ResolverAddress: string | null
}

export type DirectClassifiedName = ClassifiedNameBase & {
  readonly action: 'migrate'
  readonly tokenType: MigrationTokenType
  readonly resolverStrategy: ResolverStrategy
  /**
   * The live ENSv1 registry controller, recorded only when it differs from the
   * registrant. V1 keeps the two separate and a plain `transferFrom` moves the
   * token without touching the controller, so a divergence is evidence of a
   * stale controller just as often as of an appointed manager — the two are
   * indistinguishable on-chain. Held for display and for an explicit per-name
   * opt-in; it is never an authority the migration carries forward on its own.
   */
  readonly registryController: Address | null
  /**
   * The account that will be granted `ROLE_SET_RESOLVER` on the migrated name.
   * Only ever set by {@link withManagerRestorationOptIn}, never by
   * classification — see `registryController`.
   */
  readonly managerAddress: Address | null
}

export type CopyClassifiedName = ClassifiedNameBase & {
  readonly action: 'copy'
  readonly tokenType: CopyTokenType
  readonly copySource: CopySource
  readonly sourceExpiry: bigint
  readonly resolverStrategy: 'to-owned-permres'
  readonly registryController: null
  readonly managerAddress: null
}

export type ClassifiedName = DirectClassifiedName | CopyClassifiedName

const nameKey = (name: string): string => name.toLowerCase()

/**
 * Names whose ENSv1 registrant and registry controller disagree, so the owner
 * can be asked — per name, with the address shown — whether that controller
 * should keep managing the name after the upgrade.
 */
export const managerRestorationCandidates = (
  names: readonly ClassifiedName[],
): readonly DirectClassifiedName[] =>
  names.filter(
    (name): name is DirectClassifiedName =>
      name.action === 'migrate' && name.registryController !== null,
  )

/**
 * Carry the ENSv1 registry controller forward as a v2 manager, but only for the
 * names the owner explicitly opted in. Classification deliberately leaves
 * `managerAddress` null so that nothing is granted by default.
 */
export const withManagerRestorationOptIn = <T extends ClassifiedName>(
  names: readonly T[],
  optedInNames: Iterable<string>,
): T[] => {
  const optedIn = new Set([...optedInNames].map(nameKey))
  if (optedIn.size === 0) return [...names]

  return names.map((name) =>
    name.action === 'migrate' &&
    name.registryController !== null &&
    optedIn.has(nameKey(name.domain.name))
      ? { ...name, managerAddress: name.registryController }
      : name,
  )
}

export const hasFuse = (fuses: bigint, fuse: bigint): boolean =>
  (fuses & fuse) !== 0n

const resolverStrategyFor = (params: {
  tokenType: MigrationTokenType
  fuses: bigint
  v1ResolverAddress: string | null
}): ResolverStrategy => {
  const { tokenType, fuses, v1ResolverAddress } = params

  const cannotSetResolverLocked =
    (tokenType === 'locked-2ld' || tokenType === 'locked-child') &&
    hasFuse(fuses, FUSES.CANNOT_SET_RESOLVER)

  // LockedWrapperReceiver ignores the resolver supplied in Migration.Data when
  // CANNOT_SET_RESOLVER is burned. It always reads the V1 registry instead,
  // including preserving address(0), so this path can never move to the HCA
  // resolver even when there is no existing resolver.
  if (cannotSetResolverLocked) {
    return 'keep-v1'
  }

  if (v1ResolverAddress && !isKnownPublicResolver(v1ResolverAddress)) {
    return 'keep-v1'
  }

  return 'to-owned-permres'
}

type ClassifyResult =
  | { type: 'classified'; name: ClassifiedName }
  | { type: 'ineligible'; name: IneligibleName }
  | null

const UNKNOWN_LABEL_PATTERN = /\[[0-9a-fA-F]{64}\]/
const MAX_UINT64 = (1n << 64n) - 1n

const hasUnknownLabel = (domain: V1Domain): boolean => {
  if (!domain.labelName) return true
  if (UNKNOWN_LABEL_PATTERN.test(domain.labelName)) return true
  if (UNKNOWN_LABEL_PATTERN.test(domain.name)) return true
  return false
}

const isValidLabel = (label: string): boolean => {
  const byteLength = new TextEncoder().encode(label).length
  return byteLength > 0 && byteLength <= 255 && !label.includes('.')
}

const isDotEthSubname = (
  domain: V1Domain,
  parentName: string | null,
): parentName is string =>
  parentName !== null &&
  parentName !== 'eth' &&
  domain.name.toLowerCase().endsWith('.eth')

const hasSupportedCopyResolver = (resolverAddress: string | null): boolean =>
  resolverAddress === null || isKnownPublicResolver(resolverAddress)

const hasExpiredDotEthRegistration = (
  domain: V1Domain,
  parentName: string | null,
  nowSeconds: bigint,
): boolean => {
  if (parentName !== 'eth') return false
  const registrationExpiry = domain.registration?.expiryDate
  if (registrationExpiry) return BigInt(registrationExpiry) <= nowSeconds
  // Fall back to the wrapper expiry only while the name is genuinely in its
  // grace period: `wrapperExpiry - GRACE <= now < wrapperExpiry`. A wrapper
  // expiry fully in the past means the wrapper is stale/expired (the name has
  // reverted to its registrant) — not a grace-period registration — so it must
  // not be flagged here.
  const wrappedExpiry = domain.wrappedDomain?.expiryDate
  if (wrappedExpiry) {
    const expiry = BigInt(wrappedExpiry)
    return expiry - GRACE_PERIOD_SECONDS <= nowSeconds && nowSeconds < expiry
  }
  return false
}

type ClassificationContext = {
  readonly domain: V1Domain
  readonly label: string
  readonly ownerAddressLower: string
  readonly parentName: string | null
  readonly v1ResolverAddress: string | null
  readonly nowSeconds: bigint
}

const ineligible = (
  domain: V1Domain,
  reason: IneligibleReason,
): ClassifyResult => ({ type: 'ineligible', name: { domain, reason } })

const classifyWithoutActiveWrapper = (
  context: ClassificationContext,
): ClassifyResult => {
  const {
    domain,
    label,
    ownerAddressLower,
    parentName,
    v1ResolverAddress,
    nowSeconds,
  } = context

  if (isDotEthSubname(domain, parentName)) {
    const registryOwner = toAddress(domain.owner.id)
    if (!registryOwner || registryOwner.toLowerCase() !== ownerAddressLower) {
      return null
    }
    if (!hasSupportedCopyResolver(v1ResolverAddress)) {
      return ineligible(domain, 'unsupported-resolver')
    }
    return {
      type: 'classified',
      name: {
        action: 'copy',
        domain,
        tokenType: 'registry-child',
        copySource: 'registry',
        sourceExpiry: MAX_UINT64,
        label,
        parentName,
        fuses: 0n,
        tokenHolder: registryOwner,
        v1ResolverAddress,
        resolverStrategy: 'to-owned-permres',
        registryController: null,
        managerAddress: null,
      },
    }
  }

  const registrant = domain.registrant
  if (registrant?.id.toLowerCase() !== ownerAddressLower) return null
  if (parentName !== 'eth') return null
  if (hasExpiredDotEthRegistration(domain, parentName, nowSeconds)) {
    return ineligible(domain, 'expired-registration')
  }

  const tokenHolder = toAddress(registrant.id)
  if (!tokenHolder) return null
  const registryOwnerAddress = toAddress(domain.owner.id)
  // Recorded, never granted. The registrant owns the name; a controller that is
  // someone else may be a manager the registrant appointed, or the seller a
  // marketplace `transferFrom` left behind. Only the owner can tell the two
  // apart, so the decision is deferred to an explicit per-name opt-in.
  const registryController =
    registryOwnerAddress &&
    registryOwnerAddress.toLowerCase() !== registrant.id.toLowerCase()
      ? registryOwnerAddress
      : null

  return {
    type: 'classified',
    name: {
      action: 'migrate',
      domain,
      tokenType: 'unwrapped',
      label,
      parentName,
      fuses: 0n,
      tokenHolder,
      v1ResolverAddress,
      resolverStrategy: resolverStrategyFor({
        tokenType: 'unwrapped',
        fuses: 0n,
        v1ResolverAddress,
      }),
      registryController,
      managerAddress: null,
    },
  }
}

const classifyUnlockedWrapper = (
  context: ClassificationContext,
  wrappedDomain: NonNullable<V1Domain['wrappedDomain']>,
  wrappedHolder: Address,
  fuses: bigint,
): ClassifyResult => {
  const { domain, label, parentName, v1ResolverAddress, nowSeconds } = context
  if (parentName === 'eth') {
    return {
      type: 'classified',
      name: {
        action: 'migrate',
        domain,
        tokenType: 'unlocked',
        label,
        parentName,
        fuses,
        tokenHolder: wrappedHolder,
        v1ResolverAddress,
        resolverStrategy: resolverStrategyFor({
          tokenType: 'unlocked',
          fuses,
          v1ResolverAddress,
        }),
        registryController: null,
        managerAddress: null,
      },
    }
  }
  if (!parentName) return ineligible(domain, 'missing-parent')

  const parentFuses = domain.parent?.wrappedDomain?.fuses
  if (
    hasFuse(fuses, FUSES.PARENT_CANNOT_CONTROL) &&
    parentFuses !== undefined &&
    hasFuse(BigInt(parentFuses), FUSES.CANNOT_UNWRAP)
  ) {
    return {
      type: 'classified',
      name: {
        action: 'migrate',
        domain,
        tokenType: 'detached-child',
        label,
        parentName,
        fuses,
        tokenHolder: wrappedHolder,
        v1ResolverAddress,
        resolverStrategy: resolverStrategyFor({
          tokenType: 'detached-child',
          fuses,
          v1ResolverAddress,
        }),
        registryController: null,
        managerAddress: null,
      },
    }
  }
  if (!isDotEthSubname(domain, parentName)) return null

  const sourceExpiry = BigInt(wrappedDomain.expiryDate)
  // Parent-controlled NameWrapper subnames may retain an unset zero expiry.
  // Once emancipated, the same value is already expired.
  const hasNoIndependentExpiry =
    sourceExpiry === 0n && !hasFuse(fuses, FUSES.PARENT_CANNOT_CONTROL)
  if (!hasNoIndependentExpiry && sourceExpiry <= nowSeconds) {
    return ineligible(domain, 'expired-registration')
  }
  if (!hasSupportedCopyResolver(v1ResolverAddress)) {
    return ineligible(domain, 'unsupported-resolver')
  }
  return {
    type: 'classified',
    name: {
      action: 'copy',
      domain,
      tokenType: 'unlocked-child',
      copySource: 'name-wrapper',
      sourceExpiry,
      label,
      parentName,
      fuses,
      tokenHolder: wrappedHolder,
      v1ResolverAddress,
      resolverStrategy: 'to-owned-permres',
      registryController: null,
      managerAddress: null,
    },
  }
}

const classifyLockedWrapper = (
  context: ClassificationContext,
  wrappedHolder: Address,
  fuses: bigint,
): ClassifyResult => {
  const { domain, label, parentName, v1ResolverAddress } = context
  if (hasFuse(fuses, FUSES.CANNOT_TRANSFER)) {
    return ineligible(domain, 'not-transferable')
  }
  if (!parentName) return ineligible(domain, 'missing-parent')

  const tokenType: MigrationTokenType =
    parentName === 'eth' ? 'locked-2ld' : 'locked-child'
  return {
    type: 'classified',
    name: {
      action: 'migrate',
      domain,
      tokenType,
      label,
      parentName,
      fuses,
      tokenHolder: wrappedHolder,
      v1ResolverAddress,
      resolverStrategy: resolverStrategyFor({
        tokenType,
        fuses,
        v1ResolverAddress,
      }),
      registryController: null,
      managerAddress: null,
    },
  }
}

const classifyActiveWrapper = (
  context: ClassificationContext,
  wrappedDomain: NonNullable<V1Domain['wrappedDomain']>,
): ClassifyResult => {
  const { domain, ownerAddressLower, parentName, nowSeconds } = context
  const wrappedOwner = domain.wrappedOwner
  if (!wrappedOwner || wrappedOwner.id.toLowerCase() !== ownerAddressLower) {
    return null
  }
  const wrappedHolder = toAddress(wrappedOwner.id)
  if (!wrappedHolder) return null
  if (hasExpiredDotEthRegistration(domain, parentName, nowSeconds)) {
    return ineligible(domain, 'expired-registration')
  }

  const fuses = BigInt(wrappedDomain.fuses)
  return hasFuse(fuses, FUSES.CANNOT_UNWRAP)
    ? classifyLockedWrapper(context, wrappedHolder, fuses)
    : classifyUnlockedWrapper(context, wrappedDomain, wrappedHolder, fuses)
}

export const classifyName = (
  domain: V1Domain,
  ownerAddress: Address,
): ClassifyResult => {
  if (hasUnknownLabel(domain)) return ineligible(domain, 'unknown-label')
  const label = domain.labelName
  if (!label) return null
  if (!isValidLabel(label)) {
    return { type: 'ineligible', name: { domain, reason: 'invalid-label' } }
  }

  const ownerAddressLower = ownerAddress.toLowerCase()
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000))
  const context: ClassificationContext = {
    domain,
    label,
    ownerAddressLower,
    parentName: domain.parent?.name ?? null,
    v1ResolverAddress: domain.resolver?.address ?? null,
    nowSeconds,
  }
  const wrappedOwnerMatches =
    domain.wrappedOwner?.id.toLowerCase() === ownerAddressLower
  const wrappedDomain =
    domain.wrappedDomain &&
    (BigInt(domain.wrappedDomain.expiryDate) > nowSeconds ||
      wrappedOwnerMatches)
      ? domain.wrappedDomain
      : null

  return wrappedDomain
    ? classifyActiveWrapper(context, wrappedDomain)
    : classifyWithoutActiveWrapper(context)
}

export type ClassifyNamesResult = {
  readonly classified: ClassifiedName[]
  readonly ineligible: IneligibleName[]
}

export const classifyNames = (
  domains: V1Domain[],
  ownerAddress: Address,
): ClassifyNamesResult => {
  const results = domains.map((domain) => classifyName(domain, ownerAddress))
  const classifiedByName = new Map<string, ClassifiedName>()

  for (const result of results) {
    if (result?.type === 'classified') {
      classifiedByName.set(result.name.domain.name.toLowerCase(), result.name)
    }
  }

  const hasCompleteCopyRoute = (name: CopyClassifiedName): boolean => {
    const visited = new Set<string>()
    let parentName: string | null = name.parentName

    while (parentName && parentName !== 'eth') {
      const key = parentName.toLowerCase()
      if (visited.has(key)) return false
      visited.add(key)

      const parent = classifiedByName.get(key)
      if (!parent) return false
      if (parent.action === 'migrate') {
        return (
          parent.parentName === 'eth' &&
          (parent.tokenType === 'unwrapped' || parent.tokenType === 'unlocked')
        )
      }
      parentName = parent.parentName
    }

    return false
  }

  const classified: ClassifiedName[] = []
  const ineligible: IneligibleName[] = []

  for (const result of results) {
    if (!result) continue
    if (result.type === 'classified') {
      if (result.name.action === 'copy' && !hasCompleteCopyRoute(result.name)) {
        ineligible.push({
          domain: result.name.domain,
          reason: 'missing-parent',
        })
        continue
      }
      classified.push(result.name)
    } else {
      ineligible.push(result.name)
    }
  }

  return { classified, ineligible }
}
