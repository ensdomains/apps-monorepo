import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getDnsSecEnabledQueryOptions } from '@/features/profile/hooks/useDnsSecEnabled'

/**
 * TLDs to suggest in search when user types a single label.
 * "eth" is always valid (native ENS). Others are checked for DNSSEC via useSuggestionTlds.
 */
const SUGGESTION_TLDs = ['eth', 'xyz', 'box', 'com', 'lol'] as const

/**
 * TLDs that are always valid (no DNSSEC check).
 * "eth" is the native ENS TLD.
 */
const ALWAYS_VALID_TLDS = ['eth']

/**
 * Returns the list of TLDs to suggest for multi-TLD search.
 * "eth" is always included; other TLDs from SUGGESTION_TLDs are included
 * only when DNSSEC is enabled for that TLD.
 */
export const useSuggestionTlds = () => {
  const nonEthTlds = useMemo(
    () => SUGGESTION_TLDs.filter((t) => t !== 'eth'),
    [],
  )

  const queries = useQueries({
    queries: nonEthTlds.map((tld) =>
      getDnsSecEnabledQueryOptions({ tld, enabled: true }),
    ),
  })

  const validTlds = useMemo(() => {
    const list = [...ALWAYS_VALID_TLDS]
    queries.forEach((q, i) => {
      if (q.data === true) list.push(nonEthTlds[i])
    })
    return list
  }, [queries, nonEthTlds])

  const isLoading = queries.some((q) => q.isLoading)

  return { validTlds, isLoading }
}
