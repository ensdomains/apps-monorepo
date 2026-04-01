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
  readonly domain: V1Domain
  readonly tokenType: MigrationTokenType
  readonly label: string
  readonly parentName: string | null
  readonly fuses: number
  readonly tokenHolder: Address
  readonly v1ResolverAddress: string | null
}

export const hasFuse = (fuses: number, fuse: number): boolean =>
  (fuses & fuse) !== 0

export const classifyName = (
  domain: V1Domain,
  ownerAddress: Address,
): ClassifiedName | null => {
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

export const classifyNames = (
  domains: V1Domain[],
  ownerAddress: Address,
): ClassifiedName[] =>
  domains.flatMap((domain) => {
    const classified = classifyName(domain, ownerAddress)
    return classified ? [classified] : []
  })

export type GroupedNames = {
  readonly unwrapped: readonly ClassifiedName[]
  readonly unlocked: readonly ClassifiedName[]
  readonly locked2ld: readonly ClassifiedName[]
  readonly lockedChildren: ReadonlyMap<string, readonly ClassifiedName[]>
}

export const groupClassifiedNames = (names: ClassifiedName[]): GroupedNames => {
  const unwrapped: ClassifiedName[] = []
  const unlocked: ClassifiedName[] = []
  const locked2ld: ClassifiedName[] = []
  const lockedChildren = new Map<string, ClassifiedName[]>()

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
      case 'locked-child': {
        const parent = name.parentName ?? 'unknown'
        const existing = lockedChildren.get(parent) ?? []
        existing.push(name)
        lockedChildren.set(parent, existing)
        break
      }
    }
  }

  return { unwrapped, unlocked, locked2ld, lockedChildren }
}
