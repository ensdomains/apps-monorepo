import type { Address } from 'viem'

export const V1_CONTRACTS = {
  BaseRegistrar: '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85' as Address,
  NameWrapper: '0x0635513f179D50A207757E05759CbD106d7dFcE8' as Address,
  ENSRegistry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as Address,
  PublicResolver: '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5' as Address,
} as const

export const V2_DEPLOY_BLOCK = 10462885n

// TODO(ensjs): these ENS v2 Sepolia deployment addresses should live in a
// shared `@ensdomains/ensjs` export so every consumer uses one source of
// truth. Remove this local table once the upstream addresses export lands.
export const V2_CONTRACTS = {
  ETHRegistry: '0x28356dacb84ee3ebdb007d1f5920b24c87e90d40' as Address,
  MigrationHelper: '0x09B9E95D8633EDA8d9E530f258c634A2953Cd3FA' as Address,
  UnlockedMigrationController:
    '0xf9108e0797406c45ca43f103b176cbd902a12fba' as Address,
  LockedMigrationController:
    '0x806c44f027a6f6ee75ade3f6dbf1c6db496ffc67' as Address,
  ENSV2Resolver: '0xcc8eff4ad952de82990264d5adb32fc9399ecb64' as Address,
  VerifiableFactory: '0x04fd5ee60b015b6efd21a54d1e662d68868683c5' as Address,
  PermissionedResolverImpl:
    '0xe566a1fbaf30ff7c39828fe99f955fc55544cb9c' as Address,
} as const
