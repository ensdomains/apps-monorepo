import { type Address, zeroAddress } from 'viem'
import type { ClassifiedName } from './classifyNames'

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
  const resolver: Address = (() => {
    switch (name.resolverStrategy) {
      case 'keep-v1':
        return (name.v1ResolverAddress ?? defaultResolver) as Address
      case 'to-owned-permres':
        return ownedPermRes ?? defaultResolver
    }
  })()
  if (resolver === zeroAddress) {
    throw new Error(
      `Resolver for "${name.domain.name}" resolved to the zero address (strategy=${name.resolverStrategy})`,
    )
  }
  return resolver
}
