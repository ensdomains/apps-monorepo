import { type ClassifiedName, isKnownPublicResolver } from '@ens-apps/migration'
import type { SupportedL1ChainId } from '@ensdomains/ensjs/chain'
import { type Address, isAddress, isAddressEqual, zeroAddress } from 'viem'

export type RetainedResolverGroup = {
  readonly resolver: Address
  readonly kind: 'unsupported' | 'imported'
  readonly names: readonly string[]
}

export type MigrationResolverReview = {
  readonly selectionNames: readonly string[]
  readonly groups: readonly RetainedResolverGroup[]
}

const retainedResolverFor = (
  name: ClassifiedName,
  chainId: SupportedL1ChainId,
): Omit<RetainedResolverGroup, 'names'> | null => {
  const imported = name.action === 'copy' && !!name.recreationRoot
  const resolver = name.v1ResolverAddress
  if (
    !resolver ||
    !isAddress(resolver) ||
    isAddressEqual(resolver, zeroAddress)
  )
    return null
  if (!imported && name.resolverStrategy !== 'keep-v1') return null
  if (
    name.action === 'migrate' &&
    name.lockedResolverAddress &&
    !isAddressEqual(resolver, name.lockedResolverAddress)
  )
    return null
  const known = isKnownPublicResolver(resolver, chainId)
  if (known && !imported) return null
  return {
    resolver: resolver.toLowerCase() as Address,
    kind: known ? 'imported' : 'unsupported',
  }
}

/** Review the prepared operations, including children discovered under a selected parent. */
export const getMigrationResolverReview = (
  names: readonly ClassifiedName[],
  chainId: SupportedL1ChainId,
  options: { readonly includeImportedNames?: boolean } = {},
): MigrationResolverReview => {
  const selectionNames = new Set<string>()
  const groups = new Map<
    string,
    {
      resolver: Address
      kind: RetainedResolverGroup['kind']
      names: Set<string>
    }
  >()

  for (const name of names) {
    const imported = name.action === 'copy' && !!name.recreationRoot
    // Children are implicit during import discovery, but explicitly selected
    // when resuming the remaining operations from a recovery snapshot.
    if (!imported || options.includeImportedNames)
      selectionNames.add(name.domain.name.toLowerCase())
    const retained = retainedResolverFor(name, chainId)
    if (!retained) continue
    const key = `${retained.kind}:${retained.resolver}`
    const group = groups.get(key) ?? {
      ...retained,
      names: new Set<string>(),
    }
    group.names.add(name.domain.name)
    groups.set(key, group)
  }

  return {
    selectionNames: [...selectionNames].sort(),
    groups: [...groups.values()]
      .sort((a, b) =>
        a.kind === b.kind
          ? a.resolver.localeCompare(b.resolver)
          : a.kind === 'unsupported'
            ? -1
            : 1,
      )
      .map((group) => ({ ...group, names: [...group.names].sort() })),
  }
}

/** A changed checkbox must not briefly show the previous selection's review. */
export const matchesResolverReviewSelection = (
  review: MigrationResolverReview,
  selectedNames: ReadonlySet<string>,
): boolean => {
  const selected = new Set([...selectedNames].map((name) => name.toLowerCase()))
  return (
    selected.size === review.selectionNames.length &&
    review.selectionNames.every((name) => selected.has(name))
  )
}
