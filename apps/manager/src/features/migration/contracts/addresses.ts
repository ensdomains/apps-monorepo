import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'

const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]

export const V2_DEPLOY_BLOCK = 10462885n

// V2 contracts — sourced from ensjs's sepolia chain config where available
// (the three migration controllers landed in ensjs in commit 1d4334e).
//
// `DefaultResolver` is the V2 PublicResolver and is written into each
// migrated name's registry slot as a fallback (used by the migration plan
// when a name's existing v1 resolver is unknown, or when the owner doesn't
// yet have a dedicated PermissionedResolver instance). The address matches
// `LockedWrapperReceiver.PUBLIC_RESOLVER` on-chain — read it via
// `cast call <LockedMigrationController> 'PUBLIC_RESOLVER()'` to verify.
// ensjs doesn't export this address yet; remove the hardcode once it does.
export const V2_CONTRACTS = {
  ETHRegistry: ensjsSepolia.ensRegistry.address,
  VerifiableFactory: ensjsSepolia.ensVerifiableFactory.address,
  PermissionedResolverImpl: ensjsSepolia.ensPermissionedResolverImpl.address,
  UnlockedMigrationController:
    ensjsSepolia.ensUnlockedMigrationController.address,
  LockedMigrationController: ensjsSepolia.ensLockedMigrationController.address,
  MigrationHelper: ensjsSepolia.ensMigrationHelper.address,
  DefaultResolver: '0x5239a812ec9a62f46dbb5de8f346c8efe7553a9f',
} as const
