import {
  ensL1Contracts,
  type SupportedL1Contract,
} from '@ensdomains/ensjs/chain'
import { type Address, zeroAddress } from 'viem'

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
  ensDefaultReverseResolver: 'DefaultReverseResolver',
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

const contractRoles: Partial<
  Record<SupportedL1Contract, 'registry' | 'resolver'>
> = {
  ensRegistry: 'registry',
  ensLegacyRegistry: 'registry',
  ensUserRegistryImpl: 'registry',
  ensPublicResolver: 'resolver',
  ensUniversalResolver: 'resolver',
  ensDefaultReverseResolver: 'resolver',
  ensPermissionedResolverImpl: 'resolver',
}

type ContractLookup = Map<string, string>
type RoleLookup = Map<string, 'registry' | 'resolver'>

const lookupByChain = new Map<number, ContractLookup>()
const roleByChain = new Map<number, RoleLookup>()

for (const [chainIdStr, contracts] of Object.entries(ensL1Contracts)) {
  const chainId = Number(chainIdStr)
  const lookup: ContractLookup = new Map()
  const roles: RoleLookup = new Map()

  for (const [key, contract] of Object.entries(contracts)) {
    const contractKey = key as SupportedL1Contract
    const addr = (contract as { address: Address }).address
    if (!addr || addr === zeroAddress) continue
    const normalized = addr.toLowerCase()
    lookup.set(normalized, contractDisplayNames[contractKey] ?? key)
    const role = contractRoles[contractKey]
    if (role) roles.set(normalized, role)
  }

  lookupByChain.set(chainId, lookup)
  roleByChain.set(chainId, roles)
}

/**
 * Returns the human-readable ENS contract name for a given address on a chain,
 * or undefined if the address is not a known ENS contract.
 */
export const getEnsContractName = (
  chainId: number,
  address: Address,
): string | undefined => {
  const lookup = lookupByChain.get(chainId)
  if (!lookup) return undefined
  return lookup.get(address.toLowerCase())
}

/**
 * Short role pill for known registry / resolver addresses.
 * Prefer these over display names like "ENSRegistry".
 */
export const getContractEntityLabel = (
  chainId: number,
  address: Address,
): 'registry' | 'resolver' | undefined =>
  roleByChain.get(chainId)?.get(address.toLowerCase())
