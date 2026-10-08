export type DnsImportType = 'offchain' | 'onchain'

/**
 * DNSSEC and the ownership TXT record are configured in the same place (the
 * DNS manager), so they share one `setup` step rather than being revealed one
 * after the other. The legacy `dnssec`/`verify` values still route here.
 */
export type DnsImportStep = 'start' | 'setup'
