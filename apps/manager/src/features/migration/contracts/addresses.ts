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
  UnlockedMigrationController: '0xde85e6b9928062fd2347d78a5bcac6266078f381',
  LockedMigrationController: '0xc8283ef6e8b596d28f0fab1d77a2b6d5c11a56cc',
  MigrationHelper: '0xe22200c1f0c83e7f544e26a424f2c571958bf763',
  ENSV2Resolver: '0x89b5bcfa024ae4a70e4479f806c2929c6e373476',
} as const
