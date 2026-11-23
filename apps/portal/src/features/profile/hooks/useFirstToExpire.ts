import { useQueries } from '@tanstack/react-query'
import { getFirstToExpire } from '@/utils/names/addressNames'
import { getRegistrationDataQueryOptions } from './useRegistrationData'

/** The name among `names` that expires first; null when one couldn't be read or none expires. */
export const useFirstToExpire = (names: readonly string[]) => {
  const queries = useQueries({
    queries: names.map((name) => getRegistrationDataQueryOptions({ name })),
  })
  // An unread name is left out, so the first to expire reads as unknown.
  const expiryOf = new Map(
    names.flatMap((name, index) => {
      const query = queries[index]
      if (!query?.isSuccess) return []
      const { expiry } = query.data
      return [[name, expiry === null ? null : new Date(expiry * 1000)] as const]
    }),
  )
  return {
    firstToExpire: getFirstToExpire(names, expiryOf),
    isLoading: queries.some((query) => query.isLoading),
  }
}
