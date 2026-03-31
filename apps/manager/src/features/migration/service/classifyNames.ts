import type { Address } from 'viem'
import type { V1Domain } from './v1SubgraphClient'

/** NameWrapper fuse bitmask constants from INameWrapper.sol */
export const FUSES = {
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

export type ClassifiedName = {
  domain: V1Domain
  tokenType: MigrationTokenType
  /** The label portion of the name (e.g. "nick" for nick.eth) */
  label: string
  /** Parent name (e.g. "eth" for nick.eth, "nick.eth" for sub.nick.eth) */
  parentName: string | null
  /** Raw fuse value from NameWrapper, 0 for unwrapped */
  fuses: number
  /**
   * The address that currently holds the V1 token.
   * Used as the `from` parameter in safeTransferFrom.
   *
   * - Unwrapped: registrant address (BaseRegistrar ERC-721 owner)
   * - Wrapped: wrappedOwner address (NameWrapper ERC-1155 owner)
   */
  tokenHolder: Address
  /**
   * The resolver to set in v2.
   * For locked names with CANNOT_SET_RESOLVER, this is the v1 resolver address.
   * For all other names, this should be set to ENSV2Resolver by the caller.
   */
  v1ResolverAddress: string | null
}

export function hasFuse(fuses: number, fuse: number): boolean {
  return (fuses & fuse) !== 0
}

/**
 * Classify a single V1Domain into a migration type.
 *
 * Returns null for names that cannot be migrated:
 * - No label name
 * - No registrant (unwrapped) or wrappedOwner (wrapped) matching the owner
 * - CANNOT_TRANSFER burned on locked names
 * - Unlocked 3LD+ (must be registered directly in v2, not migrated)
 */
export function classifyName(
  domain: V1Domain,
  ownerAddress: Address,
): ClassifiedName | null {
  const label = domain.labelName
  if (!label) return null

  const parentName = domain.parent?.name ?? null
  const addr = ownerAddress.toLowerCase()
  const v1ResolverAddress = domain.resolver?.address ?? null

  // Unwrapped: No wrapped domain data, has a registrant matching owner
  if (!domain.wrappedDomain) {
    if (domain.registrant?.id.toLowerCase() !== addr) return null
    // Unwrapped names are only 2LD (.eth)
    if (parentName !== 'eth') return null
    return {
      domain,
      tokenType: 'unwrapped',
      label,
      parentName,
      fuses: 0,
      tokenHolder: domain.registrant!.id as Address,
      v1ResolverAddress,
    }
  }

  // Wrapped: Must have wrappedOwner matching owner
  if (domain.wrappedOwner?.id.toLowerCase() !== addr) return null

  const fuses = domain.wrappedDomain.fuses
  const wrappedHolder = domain.wrappedOwner.id as Address

  // Wrapped but unlocked (CANNOT_UNWRAP not set)
  if (!hasFuse(fuses, FUSES.CANNOT_UNWRAP)) {
    // Unlocked 3LD+ cannot be migrated - must be registered directly in v2
    if (parentName !== 'eth') return null
    return {
      domain,
      tokenType: 'unlocked',
      label,
      parentName,
      fuses,
      tokenHolder: wrappedHolder,
      v1ResolverAddress,
    }
  }

  // Locked with CANNOT_TRANSFER - unmigratable
  if (hasFuse(fuses, FUSES.CANNOT_TRANSFER)) return null

  if (parentName === 'eth') {
    return {
      domain,
      tokenType: 'locked-2ld',
      label,
      parentName,
      fuses,
      tokenHolder: wrappedHolder,
      v1ResolverAddress,
    }
  }

  return {
    domain,
    tokenType: 'locked-child',
    label,
    parentName,
    fuses,
    tokenHolder: wrappedHolder,
    v1ResolverAddress,
  }
}

/**
 * Classify and filter an array of V1Domains into migratable names.
 */
export function classifyNames(
  domains: V1Domain[],
  ownerAddress: Address,
): ClassifiedName[] {
  return domains.flatMap((domain) => {
    const classified = classifyName(domain, ownerAddress)
    return classified ? [classified] : []
  })
}

/**
 * Group classified names by their migration transaction type.
 */
export type GroupedNames = {
  unwrapped: ClassifiedName[]
  unlocked: ClassifiedName[]
  locked2ld: ClassifiedName[]
  /** Map of parent name → children that need to go to parent's WrapperRegistry */
  lockedChildren: Map<string, ClassifiedName[]>
}

export function groupClassifiedNames(names: ClassifiedName[]): GroupedNames {
  const groups: GroupedNames = {
    unwrapped: [],
    unlocked: [],
    locked2ld: [],
    lockedChildren: new Map(),
  }

  for (const name of names) {
    switch (name.tokenType) {
      case 'unwrapped':
        groups.unwrapped.push(name)
        break
      case 'unlocked':
        groups.unlocked.push(name)
        break
      case 'locked-2ld':
        groups.locked2ld.push(name)
        break
      case 'locked-child': {
        const parent = name.parentName ?? 'unknown'
        const existing = groups.lockedChildren.get(parent) ?? []
        existing.push(name)
        groups.lockedChildren.set(parent, existing)
        break
      }
    }
  }

  return groups
}
