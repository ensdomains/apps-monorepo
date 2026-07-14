import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'

const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]

export const V2_DEPLOY_BLOCK = 10462885n

// V2 contracts — all sourced from ensjs's sepolia chain config.
//
// `DefaultResolver` is the V2 PublicResolver (`ensPublicResolver`), written into
// each migrated name's registry slot as a fallback (used by the migration plan
// when a name's existing v1 resolver is unknown, or when the owner doesn't yet
// have a dedicated PermissionedResolver instance). It matches
// `LockedMigrationController.PUBLIC_RESOLVER()` on-chain.
export const V2_CONTRACTS = {
  ETHRegistry: ensjsSepolia.ensRegistry.address,
  VerifiableFactory: ensjsSepolia.ensVerifiableFactory.address,
  PermissionedResolverImpl: ensjsSepolia.ensPermissionedResolverImpl.address,
  UnlockedMigrationController:
    ensjsSepolia.ensUnlockedMigrationController.address,
  LockedMigrationController: ensjsSepolia.ensLockedMigrationController.address,
  MigrationHelper: ensjsSepolia.ensMigrationHelper.address,
  DefaultResolver: ensjsSepolia.ensPublicResolver.address,
} as const
