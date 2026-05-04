import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import type { Address } from 'viem'

const ENS_SEPOLIA_CONTRACTS = ensL1Contracts[supportedL1Chains.sepolia]

export const V1_CONTRACTS = {
  BaseRegistrar: ENS_SEPOLIA_CONTRACTS.ensBaseRegistrarImplementation.address,
  NameWrapper: ENS_SEPOLIA_CONTRACTS.ensNameWrapper.address,
  ENSRegistry: ENS_SEPOLIA_CONTRACTS.ensLegacyRegistry.address,
  PublicResolver: ENS_SEPOLIA_CONTRACTS.ensPublicResolver.address,
} as const satisfies Record<string, Address>

export const V2_DEPLOY_BLOCK = 10462885n

// Keep migration-only deployment addresses here until ensjs exports them.
const VERIFIABLE_FACTORY = ENS_SEPOLIA_CONTRACTS.ensVerifiableFactory.address

export const V2_CONTRACTS = {
  BatchRegistrar: '0xa498a50aada7790f5d3efd594365e797c947eece',
  ENSV1Resolver: '0x19c7daeb1828942debf60fb78ff70292300e7800',
  ENSV2Resolver: '0xcc8eff4ad952de82990264d5adb32fc9399ecb64',
  ETHRegistrar: ENS_SEPOLIA_CONTRACTS.ensEthRegistrar.address,
  ETHRegistry: ENS_SEPOLIA_CONTRACTS.ensRegistry.address,
  HCAFactory: '0x3ab718580b476d64fdd3ce6a9ab63491b15767d9',
  UnlockedMigrationController: '0xf9108e0797406c45ca43f103b176cbd902a12fba',
  LockedMigrationController: '0x806c44f027a6f6ee75ade3f6dbf1c6db496ffc67',
  ManagedUniversalResolverProxy: '0x541660b410b477e78e95c5d92a7f350cf86db61b',
  MockDAI: '0xa1ad79c31e9e8c4d2d0b73aaf0435a7a8a706170',
  MockUSDC: ENS_SEPOLIA_CONTRACTS.usdc.address,
  RootRegistry: '0x45e6d4230064f9dd806330da9d92639f8665d9bf',
  SimpleRegistryMetadata: '0x3b42d507e1b13ee164cab0fba4ea66f8a1b653f1',
  StandardRentPriceOracle: '0x8d10896a894b0b60c2f9533d57758b0da1abaab7',
  UniversalResolverV2: ENS_SEPOLIA_CONTRACTS.ensUniversalResolver.address,
  UpgradableUniversalResolverProxy:
    '0xd307d60cfee6f2f74b6daafebf878437e353c1f6',
  VerifiableFactory: VERIFIABLE_FACTORY,
  OwnedResolverVerifiableFactory: VERIFIABLE_FACTORY,
  WrapperRegistryImpl: '0x58a2755c4d6afdf9a8717008a05f687c3a8cb494',
  PermissionedResolverImpl:
    ENS_SEPOLIA_CONTRACTS.ensPermissionedResolverImpl.address,
} as const satisfies Record<string, Address>
