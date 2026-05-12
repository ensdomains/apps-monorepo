import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'

const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]

export const V1_CONTRACTS = {
  BaseRegistrar: '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85',
  NameWrapper: '0x0635513f179D50A207757E05759CbD106d7dFcE8',
  ENSRegistry: '0x94f523b8261B815b87EFfCf4d18E6aBeF18d6e4b',
  PublicResolver: '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5',
} as const

export const V2_DEPLOY_BLOCK = 10462885n

export const V2_CONTRACTS = {
  ETHRegistry: '0x28356dacb84ee3ebdb007d1f5920b24c87e90d40',
  VerifiableFactory: '0x04fd5ee60b015b6efd21a54d1e662d68868683c5',
  PermissionedResolverImpl: ensjsSepolia.ensPermissionedResolverImpl.address,
  UnlockedMigrationController: '0xf9108e0797406c45ca43f103b176cbd902a12fba',
  LockedMigrationController: '0x806c44f027a6f6ee75ade3f6dbf1c6db496ffc67',
  MigrationHelper: '0x6EAE7487659cCb3892248149a934f32dfB259485',
  ENSV2Resolver: '0xcc8eff4ad952de82990264d5adb32fc9399ecb64',
} as const
