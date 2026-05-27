import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'

const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]

// V1 contracts — all sourced from ensjs.
export const V1_CONTRACTS = {
  BaseRegistrar: ensjsSepolia.ensBaseRegistrarImplementation.address,
  NameWrapper: ensjsSepolia.ensNameWrapper.address,
  ENSRegistry: ensjsSepolia.ensLegacyRegistry.address,
  PublicResolver: ensjsSepolia.ensPublicResolver.address,
} as const

export const V2_DEPLOY_BLOCK = 10462885n

// V2 contracts — sourced from ensjs's sepolia chain config. The migration
// controllers landed in ensjs in commit 1d4334e; `DefaultResolver` is the
// Universal Resolver, which migrated names will use as their resolver until
// the owner sets a dedicated resolver via the V2 deploy-registry flow.
export const V2_CONTRACTS = {
  ETHRegistry: ensjsSepolia.ensRegistry.address,
  VerifiableFactory: ensjsSepolia.ensVerifiableFactory.address,
  PermissionedResolverImpl: ensjsSepolia.ensPermissionedResolverImpl.address,
  UnlockedMigrationController:
    ensjsSepolia.ensUnlockedMigrationController.address,
  LockedMigrationController: ensjsSepolia.ensLockedMigrationController.address,
  MigrationHelper: ensjsSepolia.ensMigrationHelper.address,
  DefaultResolver: ensjsSepolia.ensUniversalResolver.address,
} as const
