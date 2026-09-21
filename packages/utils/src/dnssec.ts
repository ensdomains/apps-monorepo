import { DnsResponseStatus, getDnsTxtRecords } from '@ensdomains/ensjs/utils'

/**
 * Checks whether a TLD has DNSSEC enabled, via a DNS-over-HTTPS lookup.
 *
 * @param tld - The TLD to check (e.g., "xyz", "com")
 * @returns true if DNSSEC is enabled, false otherwise
 */
export const getDnsSecEnabled = async (tld: string): Promise<boolean> => {
  const result = await getDnsTxtRecords({ name: tld })

  // A body without a numeric Status is not a DNS answer (e.g. a DoH gateway
  // error like `{"error": …}` served with valid JSON). That is a failed
  // lookup, not a verdict on the name — throw so callers can distinguish
  // "couldn't check" from "checked and not enabled".
  if (typeof result.Status !== 'number') {
    throw new Error(`DNS lookup for "${tld}" returned no valid DNS response`)
  }

  // NXDOMAIN means the TLD doesn't exist
  if (result.Status === DnsResponseStatus.NXDOMAIN) return false

  // AD flag indicates DNSSEC validation passed
  return result.AD ?? false
}
