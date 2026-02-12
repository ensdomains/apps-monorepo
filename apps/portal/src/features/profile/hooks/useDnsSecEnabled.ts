import { useQuery } from '@tanstack/react-query'

const DNS_OVER_HTTP_ENDPOINT = 'https://1.1.1.1/dns-query'

type DnsRecord = {
  name: string
  type: number
  TTL: number
  data: string
}

type DnsQuestion = {
  name: string
  type: number
}

type DohResponse = {
  AD: boolean
  Answer: DnsRecord[]
  CD: false
  Question: DnsQuestion[]
  RA: boolean
  RD: boolean
  Status: number
  TC: boolean
}

/**
 * Fetches DNSSEC enabled status for a TLD via DNS-over-HTTPS.
 *
 * @param tld - The TLD to check (e.g., "eth", "xyz", "com")
 * @returns true if DNSSEC is enabled, false otherwise
 */
export const getDnsSecEnabled = async (tld: string): Promise<boolean> => {
  const response = await fetch(
    `${DNS_OVER_HTTP_ENDPOINT}?${new URLSearchParams({
      name: tld,
      do: 'true',
    })}`,
    {
      headers: {
        accept: 'application/dns-json',
      },
    },
  )
  const result: DohResponse = await response.json()
  // NXDOMAIN (Status 3) means the domain doesn't exist
  if (result?.Status === 3) return false
  // AD flag indicates DNSSEC validation passed
  return result?.AD ?? false
}

type UseDnsSecEnabledParams = {
  /** The TLD to check (without dot, e.g., "eth", "xyz") */
  tld?: string
  /** Whether the query should be enabled */
  enabled?: boolean
}

/**
 * Query options for checking if a TLD has DNSSEC enabled.
 * "eth" is always considered valid (it's the native ENS TLD).
 */
export const getDnsSecEnabledQueryOptions = ({
  tld,
  enabled = true,
}: UseDnsSecEnabledParams) => ({
  queryKey: ['dnsSecEnabled', tld] as const,
  queryFn: async () => {
    if (!tld) throw new Error('TLD is required')
    return getDnsSecEnabled(tld)
  },
  // "eth" is always valid - it's the native ENS TLD, not a DNS TLD
  // "[root]" is a special case that should be skipped
  enabled: enabled && !!tld && tld !== 'eth' && tld !== '[root]',
  staleTime: 1000 * 60 * 60, // Cache for 1 hour
  retry: 2,
})

/**
 * Hook to check if a TLD has DNSSEC enabled.
 *
 * Any TLD with DNSSEC enabled at the DNS root level is supported by ENS.
 * "eth" is always considered valid as it's the native ENS TLD.
 *
 * @example
 * const { data: isDnsSecEnabled, isLoading } = useDnsSecEnabled({ tld: 'xyz' })
 */
export const useDnsSecEnabled = (params: UseDnsSecEnabledParams) => {
  return useQuery(getDnsSecEnabledQueryOptions(params))
}
