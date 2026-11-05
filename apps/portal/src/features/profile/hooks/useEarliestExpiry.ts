import { useQueries } from '@tanstack/react-query'
import { getEarliestExpiry } from '@/utils/names/addressNames'
import { getRegistrationDataQueryOptions } from './useRegistrationData'

/** The earliest expiry among `names`; null when one couldn't be read or none expires. */
export const useEarliestExpiry = (names: readonly string[]) => {
  const queries = useQueries({
    queries: names.map((name) => getRegistrationDataQueryOptions({ name })),
  })
  // An unread name is left out, so the earliest reads as unknown.
  const expiryOf = new Map(
    names.flatMap((name, index) => {
      const query = queries[index]
      if (!query?.isSuccess) return []
      const { expiry } = query.data
      return [[name, expiry === null ? null : new Date(expiry * 1000)] as const]
    }),
  )
  return {
    earliestExpiry: getEarliestExpiry(names, expiryOf),
    isLoading: queries.some((query) => query.isLoading),
  }
}
