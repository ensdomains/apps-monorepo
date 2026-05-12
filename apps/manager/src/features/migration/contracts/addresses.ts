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

// V2 contracts — addresses available in ensjs are read from there;
// the migration controllers and ENSV2Resolver are not (yet) exported by ensjs
// so they are kept as canonical Sepolia deployment addresses.
export const V2_CONTRACTS = {
  ETHRegistry: ensjsSepolia.ensRegistry.address,
  VerifiableFactory: ensjsSepolia.ensVerifiableFactory.address,
  PermissionedResolverImpl: ensjsSepolia.ensPermissionedResolverImpl.address,
  UnlockedMigrationController: '0x76ae358d9ad91651b78463ae609dadc9e7ce4402',
  LockedMigrationController: '0x22cd7e6a89f5bf4510ef22b3dd4ef190d22f95c3',
  MigrationHelper: '0x09B9E95D8633EDA8d9E530f258c634A2953Cd3FA',
  ENSV2Resolver: '0x18cb116a1c88531a4bb2996e4fef136a31e11a80',
} as const
