import { isKnownPublicResolver } from '@ens-apps/migration'
import { type Address, zeroAddress } from 'viem'
import { envConfig } from '@/config'
import { type ClassifiedName, FUSES, hasFuse } from './classifyNames'

export type MigrationData = {
  readonly label: string
  readonly owner: Address
  readonly subregistry: Address
  readonly resolver: Address
}

export const createMigrationData = (params: {
  label: string
  owner: Address
  resolver: Address
  subregistry?: Address
}): MigrationData => ({
  label: params.label,
  owner: params.owner,
  subregistry: params.subregistry ?? zeroAddress,
  resolver: params.resolver,
})

export const resolverFor = (
  name: ClassifiedName,
  defaultResolver: Address,
  ownedPermRes: Address | null,
): Address => {
  // Imported children retain their source pointer, including a deliberately
  // unset resolver. Record copying is a separate, reviewed profile action.
  if (name.action === 'copy' && name.recreationRoot) {
    return (name.v1ResolverAddress ?? zeroAddress) as Address
  }
  const cannotSetResolverLocked =
    (name.tokenType === 'locked-2ld' || name.tokenType === 'locked-child') &&
    hasFuse(name.fuses, FUSES.CANNOT_SET_RESOLVER)
  if (
    cannotSetResolverLocked &&
    name.action === 'migrate' &&
    name.lockedResolverAddress !== undefined
  ) {
    return name.lockedResolverAddress
  }
  const resolver: Address = (() => {
    switch (name.resolverStrategy) {
      case 'keep-v1':
        return (
          isKnownPublicResolver(name.v1ResolverAddress, envConfig.chain.id)
            ? defaultResolver
            : (name.v1ResolverAddress ??
              (cannotSetResolverLocked ? zeroAddress : defaultResolver))
        ) as Address
      case 'to-owned-permres':
        return ownedPermRes ?? defaultResolver
    }
  })()
  if (resolver === zeroAddress && !cannotSetResolverLocked) {
    throw new Error(
      `Resolver for "${name.domain.name}" resolved to the zero address (strategy=${name.resolverStrategy})`,
    )
  }
  return resolver
}
