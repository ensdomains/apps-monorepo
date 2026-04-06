import type { DecodedFuses } from '@ensdomains/ensjs/utils'
import type { Address } from 'viem'
import type { V1Name } from './v1SubgraphClient'

export type MigrationTokenType =
  | 'unwrapped'
  | 'unlocked'
  | 'locked-2ld'
  | 'locked-child'

export type ClassifiedName = {
  readonly domain: V1Name
  readonly tokenType: MigrationTokenType
  readonly label: string
  readonly parentName: string | null
  readonly fuses: DecodedFuses | null
  readonly tokenHolder: Address
  readonly v1ResolverAddress: string | null
}

export const is2LD = (name: ClassifiedName): boolean =>
  name.tokenType === 'unwrapped' ||
  name.tokenType === 'unlocked' ||
  name.tokenType === 'locked-2ld'

export const classifyName = (
  domain: V1Name,
  ownerAddress: Address,
): ClassifiedName | null => {
  const label = domain.labelName
  if (!label) return null

  const parentName = domain.parentName
  const addr = ownerAddress.toLowerCase()

  if (!domain.wrappedOwner) {
    const registrant = domain.registrant
    if (registrant?.toLowerCase() !== addr) return null
    if (parentName !== 'eth') return null
    return {
      domain,
      tokenType: 'unwrapped',
      label,
      parentName,
      fuses: null,
      tokenHolder: registrant as Address,
      v1ResolverAddress: null,
    }
  }

  if (domain.wrappedOwner.toLowerCase() !== addr) return null

  const fuses = domain.fuses
  const wrappedHolder = domain.wrappedOwner as Address

  if (!fuses?.child.CANNOT_UNWRAP) {
    if (parentName !== 'eth') return null
    return {
      domain,
      tokenType: 'unlocked',
      label,
      parentName,
      fuses,
      tokenHolder: wrappedHolder,
      v1ResolverAddress: null,
    }
  }

  if (fuses.child.CANNOT_TRANSFER) return null
  if (!parentName) return null

  if (parentName === 'eth') {
    return {
      domain,
      tokenType: 'locked-2ld',
      label,
      parentName,
      fuses,
      tokenHolder: wrappedHolder,
      v1ResolverAddress: null,
    }
  }

  return {
    domain,
    tokenType: 'locked-child',
    label,
    parentName,
    fuses,
    tokenHolder: wrappedHolder,
    v1ResolverAddress: null,
  }
}

export const classifyNames = (
  domains: V1Name[],
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
        const parent = name.parentName
        if (!parent) break
        const existing = lockedChildren.get(parent) ?? []
        existing.push(name)
        lockedChildren.set(parent, existing)
        break
      }
    }
  }

  return { unwrapped, unlocked, locked2ld, lockedChildren }
}
