import type { Address } from 'viem'
import { getOffchainResolverDisplay } from '../constants'

export type DnsRecordSpec = {
  readonly type: 'TXT'
  /** DNS record name relative to the domain (`@` = the domain itself). */
  readonly name: string
  readonly value: string
}

/**
 * The record required by the onchain import path: the DNSRegistrar's
 * `DNSClaimChecker` reads a TXT record at `_ens.<name>` whose value is
 * `a=0x<address>`. The checksummed form is required by the ensjs client-side
 * check (the contract itself is case-insensitive).
 */
export const getOnchainVerificationRecord = (
  connectedAddress: Address,
): DnsRecordSpec => ({
  type: 'TXT',
  name: '_ens',
  value: `a=${connectedAddress}`,
})

/**
 * The record required by the gasless path: an `ENS1` TXT record on the domain
 * itself pointing at the official offchain resolver, with the owner address as
 * context. On mainnet the resolver is written in its name form
 * (`dnsname.ens.eth`); elsewhere as the raw deployment address.
 */
export const getOffchainVerificationRecord = (
  chainId: number,
  connectedAddress: Address,
): DnsRecordSpec => ({
  type: 'TXT',
  name: '@',
  value: `ENS1 ${getOffchainResolverDisplay(chainId)} ${connectedAddress}`,
})
