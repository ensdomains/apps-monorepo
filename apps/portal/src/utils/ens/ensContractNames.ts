import {
  ensL1Contracts,
  type SupportedL1Contract,
  supportedL1Chains,
  supportedL1Contracts,
} from '@ensdomains/ensjs/chain'
import { type Address, zeroAddress } from 'viem'
import { mainnet, sepolia } from 'viem/chains'

/** Human-readable display names for known ENS L1 contracts */
const contractDisplayNames: Record<SupportedL1Contract, string> = {
  ensBaseRegistrarImplementation: 'BaseRegistrar',
  ensBulkRenewal: 'BulkRenewal',
  ensLegacyDnsRegistrar: 'DNSRegistrar',
  ensLegacyDnssecImpl: 'DNSSECImpl',
  ensEthRegistrarController: 'ETHRegistrarController',
  ensNameWrapper: 'NameWrapper',
  ensPublicResolver: 'PublicResolver',
  ensRegistry: 'ENSRegistry',
  ensLegacyRegistry: 'LegacyENSRegistry',
  ensReverseRegistrar: 'ReverseRegistrar',
  ensUniversalResolver: 'UniversalResolver',
  ensUniversalHelper: 'UniversalHelper',
  ensDefaultReverseResolver: 'DefaultReverseResolver',
  ensDefaultReverseRegistrar: 'DefaultReverseRegistrar',
  ensDefaultReverseRegistrarAdapter: 'DefaultReverseRegistrarAdapter',
  ensReverseRegistrarAdapter: 'ReverseRegistrarAdapter',
  ensPermissionedResolverImpl: 'PermissionedResolver',
  ensVerifiableFactory: 'VerifiableFactory',
  ensEthRegistrar: 'ETHRegistrar',
  ensEthRenewerV1: 'ETHRenewerV1',
  ensUserRegistryImpl: 'UserRegistry',
  ensStandardRentPriceOracle: 'StandardRentPriceOracle',
  ensHcaFactory: 'HCAFactory',
  ensLockedMigrationController: 'LockedMigrationController',
  ensMigrationHelper: 'MigrationHelper',
  ensUnlockedMigrationController: 'UnlockedMigrationController',
  usdc: 'USDC',
  dai: 'DAI',
}

const contractPillLabels: Partial<Record<SupportedL1Contract, string>> = {
  ensRegistry: 'eth registry',
  ensLegacyRegistry: 'legacy registry',
  ensUserRegistryImpl: 'permissioned registry',
  ensPublicResolver: 'public resolver',
  ensUniversalResolver: 'universal resolver',
  ensDefaultReverseResolver: 'reverse resolver',
  ensPermissionedResolverImpl: 'permissioned resolver',
}

// TODO(multichain): these lookups are keyed by address alone, so every
// supported chain's contracts are merged into one table — an address that's an
// ENS contract on one chain would also be labeled on another. Safe today: the
// app is sepolia-scoped, and ENS deploys many core contracts (Registry,
// BaseRegistrar, …) at the same address on both chains anyway. Once the UI
// renders data from >1 L1 chain at once, key these maps by (chainId, address)
// and thread chainId through getEnsContractName / getContractLabel and their
// EntityBadge / ContractBadge callers.
const contractNames = new Map<string, string>()
const contractPills = new Map<string, string>()

/** The previous V1 PublicResolver per chain, which most V1 names still point at. */
export const PREVIOUS_PUBLIC_RESOLVERS: Readonly<Record<number, Address>> = {
  [mainnet.id]: '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63',
  [sepolia.id]: '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD',
}

for (const address of Object.values(PREVIOUS_PUBLIC_RESOLVERS)) {
  contractNames.set(
    address.toLowerCase(),
    contractDisplayNames.ensPublicResolver,
  )
  contractPills.set(address.toLowerCase(), 'public resolver')
}

for (const chainId of Object.values(supportedL1Chains)) {
  const contracts = ensL1Contracts[chainId]
  for (const key of supportedL1Contracts) {
    // Widened: ensjs holds an undeployed contract as 0x0, even though every
    // address it ships today is deployed.
    const address: Address = contracts[key].address
    if (address === zeroAddress) continue
    const normalized = address.toLowerCase()
    contractNames.set(normalized, contractDisplayNames[key])
    const pill = contractPillLabels[key]
    if (pill) contractPills.set(normalized, pill)
  }
}

/** Human-readable ENS contract name, or undefined if not a known ENS contract. */
export const getEnsContractName = (address: Address): string | undefined =>
  contractNames.get(address.toLowerCase())

/** EntityBadge label: short pill when known, otherwise the contract display name. */
export const getContractLabel = (address: Address): string | undefined =>
  contractPills.get(address.toLowerCase()) ?? getEnsContractName(address)
