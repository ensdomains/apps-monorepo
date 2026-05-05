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
  ENSV2Resolver: '0x078a7ae41974a74c62233bca5590c86218aa1f1e',
  ETHRegistrar: ENS_SEPOLIA_CONTRACTS.ensEthRegistrar.address,
  ETHRegistry: ENS_SEPOLIA_CONTRACTS.ensRegistry.address,
  HCAFactory: '0xb6fb46e1458915dd828633d91e1df8e4c3f2d4dd',
  UnlockedMigrationController: '0x5587003f8eeee1bc236d48ab39059cbfd99207d7',
  LockedMigrationController: '0x7ca1ded4d929ebd8b09e24c2da8e909014abecd8',
  ManagedUniversalResolverProxy: '0x541660b410b477e78e95c5d92a7f350cf86db61b',
  MockDAI: '0xb21412bb6816601dd840b93a5d19a8fe671cb74e',
  MockUSDC: ENS_SEPOLIA_CONTRACTS.usdc.address,
  PreMigrationController: '0xee63749b063c08dedee9478504177c27bf9193d7',
  RootRegistry: '0x45e6d4230064f9dd806330da9d92639f8665d9bf',
  SimpleRegistryMetadata: '0x3b42d507e1b13ee164cab0fba4ea66f8a1b653f1',
  StandardRentPriceOracle: '0x20a494e8a6ce80826477dd1d468337b990d71795',
  UniversalResolverV2: ENS_SEPOLIA_CONTRACTS.ensUniversalResolver.address,
  UpgradableUniversalResolverProxy:
    '0xd307d60cfee6f2f74b6daafebf878437e353c1f6',
  VerifiableFactory: VERIFIABLE_FACTORY,
  OwnedResolverVerifiableFactory: VERIFIABLE_FACTORY,
  WrapperRegistryImpl: '0x58a2755c4d6afdf9a8717008a05f687c3a8cb494',
  PermissionedResolverImpl:
    ENS_SEPOLIA_CONTRACTS.ensPermissionedResolverImpl.address,
} as const satisfies Record<string, Address>
