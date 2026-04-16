import type { Address } from 'viem'
import type { V1Domain } from './v1SubgraphClient'

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
  | 'registry-only'
  | 'not-transferable'
  | 'missing-parent'
  | 'frozen-approval'
  | 'already-migrated'

export type IneligibleName = {
  readonly domain: V1Domain
  readonly reason: IneligibleReason
}

export type ClassifiedName = {
  readonly domain: V1Domain
  readonly tokenType: MigrationTokenType
  readonly label: string
  readonly parentName: string | null
  readonly fuses: number
  readonly tokenHolder: Address
  readonly v1ResolverAddress: string | null
  readonly preservedResolver: Address | null
  readonly managerAddress: Address | null
}

export const hasFuse = (fuses: number, fuse: number): boolean =>
  (fuses & fuse) !== 0

export const is2LD = (name: ClassifiedName): boolean =>
  name.tokenType === 'unwrapped' ||
  name.tokenType === 'unlocked' ||
  name.tokenType === 'locked-2ld'

type ClassifyResult =
  | { type: 'classified'; name: ClassifiedName }
  | { type: 'ineligible'; name: IneligibleName }
  | null

export const classifyName = (
  domain: V1Domain,
  ownerAddress: Address,
): ClassifyResult => {
  const label = domain.labelName
  if (!label) return null

  const parentName = domain.parent?.name ?? null
  const addr = ownerAddress.toLowerCase()
  const v1ResolverAddress = domain.resolver?.address ?? null

  if (!domain.wrappedDomain) {
    const registrant = domain.registrant
    if (registrant?.id.toLowerCase() !== addr) return null
    if (parentName !== 'eth') return null

    const registryOwner = domain.owner.id.toLowerCase()
    const managerAddress: Address | null =
      registryOwner !== registrant.id.toLowerCase()
        ? (domain.owner.id as Address)
        : null

    return {
      type: 'classified',
      name: {
        domain,
        tokenType: 'unwrapped',
        label,
        parentName,
        fuses: 0,
        tokenHolder: registrant.id as Address,
        v1ResolverAddress,
        preservedResolver: null,
        managerAddress,
      },
    }
  }

  if (domain.wrappedOwner?.id.toLowerCase() !== addr) return null

  const fuses = domain.wrappedDomain.fuses
  const wrappedHolder = domain.wrappedOwner.id as Address

  if (!hasFuse(fuses, FUSES.CANNOT_UNWRAP)) {
    if (parentName !== 'eth') {
      if (
        hasFuse(fuses, FUSES.PARENT_CANNOT_CONTROL) &&
        parentName &&
        domain.parent?.wrappedDomain &&
        hasFuse(domain.parent.wrappedDomain.fuses, FUSES.CANNOT_UNWRAP)
      ) {
        return {
          type: 'classified',
          name: {
            domain,
            tokenType: 'detached-child',
            label,
            parentName,
            fuses,
            tokenHolder: wrappedHolder,
            v1ResolverAddress,
            preservedResolver: null,
            managerAddress: null,
          },
        }
      }
      return {
        type: 'ineligible',
        name: { domain, reason: 'unlocked-subname' },
      }
    }
    return {
      type: 'classified',
      name: {
        domain,
        tokenType: 'unlocked',
        label,
        parentName,
        fuses,
        tokenHolder: wrappedHolder,
        v1ResolverAddress,
        preservedResolver: null,
        managerAddress: null,
      },
    }
  }

  if (hasFuse(fuses, FUSES.CANNOT_TRANSFER)) {
    return { type: 'ineligible', name: { domain, reason: 'not-transferable' } }
  }
  if (!parentName) {
    return { type: 'ineligible', name: { domain, reason: 'missing-parent' } }
  }

  const preservedResolver: Address | null =
    hasFuse(fuses, FUSES.CANNOT_SET_RESOLVER) && v1ResolverAddress
      ? (v1ResolverAddress as Address)
      : null

  if (parentName === 'eth') {
    return {
      type: 'classified',
      name: {
        domain,
        tokenType: 'locked-2ld',
        label,
        parentName,
        fuses,
        tokenHolder: wrappedHolder,
        v1ResolverAddress,
        preservedResolver,
        managerAddress: null,
      },
    }
  }

  return {
    type: 'classified',
    name: {
      domain,
      tokenType: 'locked-child',
      label,
      parentName,
      fuses,
      tokenHolder: wrappedHolder,
      v1ResolverAddress,
      preservedResolver,
      managerAddress: null,
    },
  }
}

export type ClassifyNamesResult = {
  readonly classified: ClassifiedName[]
  readonly ineligible: IneligibleName[]
}

export const classifyNames = (
  domains: V1Domain[],
  ownerAddress: Address,
): ClassifyNamesResult => {
  const classified: ClassifiedName[] = []
  const ineligible: IneligibleName[] = []

  for (const domain of domains) {
    const result = classifyName(domain, ownerAddress)
    if (!result) continue
    if (result.type === 'classified') {
      classified.push(result.name)
    } else {
      ineligible.push(result.name)
    }
  }

  return { classified, ineligible }
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
