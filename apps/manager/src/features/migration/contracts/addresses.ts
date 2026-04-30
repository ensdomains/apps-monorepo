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
  BatchRegistrar: '0xa498a50aada7790f5d3efd594365e797c947eece' as Address,
  ENSV1Resolver: '0x19c7daeb1828942debf60fb78ff70292300e7800' as Address,
  ENSV2Resolver: '0xcc8eff4ad952de82990264d5adb32fc9399ecb64' as Address,
  ETHRegistrar: '0x29e8a042ea34b7ee720c12b52720027b5e9049c6' as Address,
  ETHRegistry: '0x28356dacb84ee3ebdb007d1f5920b24c87e90d40' as Address,
  HCAFactory: '0x3ab718580b476d64fdd3ce6a9ab63491b15767d9' as Address,
  UnlockedMigrationController:
    '0xf9108e0797406c45ca43f103b176cbd902a12fba' as Address,
  LockedMigrationController:
    '0x806c44f027a6f6ee75ade3f6dbf1c6db496ffc67' as Address,
  ManagedUniversalResolverProxy:
    '0x541660b410b477e78e95c5d92a7f350cf86db61b' as Address,
  MockDAI: '0xa1ad79c31e9e8c4d2d0b73aaf0435a7a8a706170' as Address,
  MockUSDC: '0xc39c1eec68a9e3c08c4f6cbebbb0fbf7aa4be06b' as Address,
  RootRegistry: '0x45e6d4230064f9dd806330da9d92639f8665d9bf' as Address,
  SimpleRegistryMetadata:
    '0x3b42d507e1b13ee164cab0fba4ea66f8a1b653f1' as Address,
  StandardRentPriceOracle:
    '0x8d10896a894b0b60c2f9533d57758b0da1abaab7' as Address,
  UniversalResolverV2: '0xf73ce79773306050b537946abb57c7cb995f58ab' as Address,
  UpgradableUniversalResolverProxy:
    '0xd307d60cfee6f2f74b6daafebf878437e353c1f6' as Address,
  VerifiableFactory: '0x04fd5ee60b015b6efd21a54d1e662d68868683c5' as Address,
  WrapperRegistryImpl: '0x58a2755c4d6afdf9a8717008a05f687c3a8cb494' as Address,
  // Not present in the supplied deployment table; required only for the
  // owned permissioned resolver replay path.
  PermissionedResolverImpl:
    '0xe566a1fbaf30ff7c39828fe99f955fc55544cb9c' as Address,
} as const
