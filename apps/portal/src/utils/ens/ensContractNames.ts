import { ensL1Contracts } from '@ensdomains/ensjs/chain'
import { zeroAddress } from 'viem'

/** Human-readable display names for known ENS L1 contracts */
const contractDisplayNames: Record<string, string> = {
  ensBaseRegistrarImplementation: 'Base Registrar',
  ensBulkRenewal: 'Bulk Renewal',
  ensLegacyDnsRegistrar: 'DNS Registrar',
  ensLegacyDnssecImpl: 'DNSSEC Impl',
  ensEthRegistrarController: 'ETH Registrar Controller',
  ensNameWrapper: 'Name Wrapper',
  ensPublicResolver: 'Public Resolver',
  ensRegistry: 'ENS Registry',
  ensLegacyRegistry: 'Legacy ENS Registry',
  ensReverseRegistrar: 'Reverse Registrar',
  ensUniversalResolver: 'Universal Resolver',
  ensPermissionedResolverImpl: 'Permissioned Resolver',
  ensVerifiableFactory: 'Verifiable Factory',
  ensEthRegistrar: 'ETH Registrar',
  ensUserRegistryImpl: 'User Registry',
  usdc: 'USDC',
}

type ContractLookup = Map<string, string>

const lookupByChain = new Map<number, ContractLookup>()

for (const [chainIdStr, contracts] of Object.entries(ensL1Contracts)) {
  const chainId = Number(chainIdStr)
  const lookup: ContractLookup = new Map()

  for (const [key, contract] of Object.entries(contracts)) {
    const addr = (contract as { address: string }).address
    if (!addr || addr === zeroAddress) continue
    const label = contractDisplayNames[key] ?? key
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
  address: string,
): string | undefined => {
  const lookup = lookupByChain.get(chainId)
  if (!lookup) return undefined
  return lookup.get(address.toLowerCase())
}
