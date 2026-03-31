import type { Address } from 'viem'
import type { V1Domain } from './v1SubgraphClient'

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
  label: string
  parentName: string | null
  fuses: number
  tokenHolder: Address
  v1ResolverAddress: string | null
}

export function hasFuse(fuses: number, fuse: number): boolean {
  return (fuses & fuse) !== 0
}

export function classifyName(
  domain: V1Domain,
  ownerAddress: Address,
): ClassifiedName | null {
  const label = domain.labelName
  if (!label) return null

  const parentName = domain.parent?.name ?? null
  const addr = ownerAddress.toLowerCase()
  const v1ResolverAddress = domain.resolver?.address ?? null

  if (!domain.wrappedDomain) {
    const registrant = domain.registrant
    if (registrant?.id.toLowerCase() !== addr) return null
    if (parentName !== 'eth') return null
    return {
      domain,
      tokenType: 'unwrapped',
      label,
      parentName,
      fuses: 0,
      tokenHolder: registrant.id as Address,
      v1ResolverAddress,
    }
  }

  if (domain.wrappedOwner?.id.toLowerCase() !== addr) return null

  const fuses = domain.wrappedDomain.fuses
  const wrappedHolder = domain.wrappedOwner.id as Address

  if (!hasFuse(fuses, FUSES.CANNOT_UNWRAP)) {
    // Unlocked 3LD+ cannot be migrated
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

export function classifyNames(
  domains: V1Domain[],
  ownerAddress: Address,
): ClassifiedName[] {
  return domains.flatMap((domain) => {
    const classified = classifyName(domain, ownerAddress)
    return classified ? [classified] : []
  })
}

export type GroupedNames = {
  unwrapped: ClassifiedName[]
  unlocked: ClassifiedName[]
  locked2ld: ClassifiedName[]
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
