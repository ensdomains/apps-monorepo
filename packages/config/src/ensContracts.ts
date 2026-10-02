import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'

/**
 * Sepolia redeployment from contracts-v2#460 (2026-10-01).
 * Source: contracts/deployments/sepolia @ 95de2ee0e9994a39712977a8dea495b56301a129.
 * Keep these overrides until the ENSjs catalog pin includes this deployment.
 * Both configured clients and direct contract lookups must use this table.
 */
export const ensContracts = {
  ...ensL1Contracts,
  [supportedL1Chains.sepolia]: {
    ...ensL1Contracts[supportedL1Chains.sepolia],
    ensDefaultReverseRegistrarAdapter: {
      address: '0x36f97328e843e37520cbF530e9402791c2754066',
    },
    ensReverseRegistrarAdapter: {
      address: '0x56Bce5E727FAa9D237341Bb5B9E8a03D5919779d',
    },
    ensUniversalHelper: {
      address: '0xd453e5Bdb62CC3beA84341B1e306319C8Ffd7DFe',
    },
    ensPermissionedResolverImpl: {
      address: '0x115eb53F0c60696633855F90b138178Fb40b2b2C',
    },
    ensRegistry: {
      address: '0xD4eBcbBdF463C9c45784603Db0dDD499BC44A8B4',
    },
    ensVerifiableFactory: {
      address: '0xDa70306C98E97eCe36F997a21368e53298572991',
    },
    ensEthRegistrar: {
      address: '0xf633e7FC17e2bbE0D0965D18ec1821dcB754a3d3',
    },
    ensEthRenewerV1: {
      address: '0xf2ece44980778966b8a0FccB3A9E339440f6e045',
    },
    usdc: {
      address: '0x240b0316Df57887DBBE58b586508b19e633a14aa',
    },
    dai: {
      address: '0xF6faC8A58a0BE13b9197f27C41B73162Fe32572b',
    },
    ensUserRegistryImpl: {
      address: '0x9BD8a88719068D09ecee662f36C0E3856708366a',
    },
    ensStandardRentPriceOracle: {
      address: '0x8196665D4ca7488B6474a9EC8E7d2719FB42263A',
    },
    ensHcaFactory: {
      address: '0x6Bad0176236e97b346B5Dd13BCc8325B931EE8ab',
    },
    ensLockedMigrationController: {
      address: '0x6029a063d69b09D23c52a754a90E4FE43aDac3A8',
    },
    ensUnlockedMigrationController: {
      address: '0x2a35B94DF22cc7354570be2284655E2CDC0e64A2',
    },
    ensMigrationHelper: {
      address: '0xA8F86EE5cdD28703bd876F3a8c10B1DE70f36899',
    },
  },
} as const
