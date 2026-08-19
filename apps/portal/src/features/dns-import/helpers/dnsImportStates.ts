import {
  BaseError,
  DnsDnssecVerificationFailedError,
  DnsDnssecWildcardExpansionError,
  DnsInvalidAddressChecksumError,
  DnsInvalidTxtRecordError,
  DnsNoTxtRecordError,
  DnsResponseStatusError,
} from '@ensdomains/ensjs'
import type { Address } from 'viem'
import { isAddressEqual } from 'viem'

/**
 * The "Found" row state on the verify-ownership step, derived from the DNS
 * lookup result. `none`/`invalid`/`dnssec-failure` block progressing;
 * `mismatch` still allows importing (the name just won't point to the
 * connected address); `verified` unlocks the happy path.
 */
export type DnsVerificationState =
  | { readonly kind: 'none' }
  | { readonly kind: 'invalid'; readonly reason: DnsErrorKind }
  | { readonly kind: 'mismatch'; readonly foundAddress: Address }
  | { readonly kind: 'verified' }

export type DnsErrorKind =
  | 'noTxtRecord'
  | 'invalidTxtRecord'
  | 'invalidAddressChecksum'
  | 'dnssecFailure'
  | 'wildcardExpansion'
  | 'unknown'

export const DNS_ERROR_MESSAGES: Record<DnsErrorKind, string> = {
  noTxtRecord: 'No matching record was found.',
  invalidTxtRecord: 'The record found is not in the expected format.',
  invalidAddressChecksum:
    'The address in the record has an invalid checksum. Copy the value exactly, including capitalization.',
  dnssecFailure:
    'DNSSEC verification failed for this record. Check your DNSSEC configuration.',
  wildcardExpansion:
    'The record comes from a wildcard, which is not supported. Add the record on the exact name.',
  unknown: 'Something went wrong reading the DNS record.',
}

/**
 * Maps an error thrown by the strict ensjs DNS lookups (`getDnsOwner`,
 * `getDnsOffchainData`) to the UI error kind. Mirrors `checkDnsError` from
 * ens-app-v3: an NXDOMAIN response status counts as "no record"; any other
 * response status is unexpected.
 */
export const dnsErrorToKind = (error: unknown): DnsErrorKind => {
  if (!(error instanceof BaseError)) return 'unknown'
  if (error instanceof DnsResponseStatusError) {
    return error.responseStatus === 'NXDOMAIN' ? 'noTxtRecord' : 'unknown'
  }
  if (error instanceof DnsNoTxtRecordError) return 'noTxtRecord'
  if (error instanceof DnsInvalidTxtRecordError) return 'invalidTxtRecord'
  if (error instanceof DnsInvalidAddressChecksumError) {
    return 'invalidAddressChecksum'
  }
  if (error instanceof DnsDnssecVerificationFailedError) return 'dnssecFailure'
  if (error instanceof DnsDnssecWildcardExpansionError) {
    return 'wildcardExpansion'
  }
  return 'unknown'
}

/**
 * Derives the verify-step state from a completed lookup: the address the DNS
 * side designates vs the connected wallet.
 */
export const deriveVerificationState = ({
  connectedAddress,
  dnsAddress,
}: {
  readonly connectedAddress: Address | undefined
  readonly dnsAddress: Address | null | undefined
}): DnsVerificationState => {
  if (!dnsAddress) return { kind: 'none' }
  if (connectedAddress && isAddressEqual(dnsAddress, connectedAddress)) {
    return { kind: 'verified' }
  }
  return { kind: 'mismatch', foundAddress: dnsAddress }
}
