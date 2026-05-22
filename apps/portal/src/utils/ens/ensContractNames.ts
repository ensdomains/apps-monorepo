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
  ensPermissionedResolverImpl: 'PermissionedResolver',
  ensVerifiableFactory: 'VerifiableFactory',
  ensEthRegistrar: 'ETHRegistrar',
  ensUserRegistryImpl: 'UserRegistry',
  ensStandardRentPriceOracle: 'StandardRentPriceOracle',
  ensHcaFactory: 'HCAFactory',
  usdc: 'USDC',
  dai: 'DAI',
}

type ContractLookup = Map<string, string>

const lookupByChain = new Map<number, ContractLookup>()

for (const [chainIdStr, contracts] of Object.entries(ensL1Contracts)) {
  const chainId = Number(chainIdStr)
  const lookup: ContractLookup = new Map()

  for (const [key, contract] of Object.entries(contracts)) {
    const addr = (contract as { address: Address }).address
    if (!addr || addr === zeroAddress) continue
    const label = contractDisplayNames[key as SupportedL1Contract] ?? key
    lookup.set(addr.toLowerCase(), label)
  }

  lookupByChain.set(chainId, lookup)
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
