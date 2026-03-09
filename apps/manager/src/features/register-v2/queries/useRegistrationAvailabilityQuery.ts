import { useQuery } from '@tanstack/react-query'
import { getSearchNameQueryOptions } from '@/features/register/services/checkNameAvailabilityService'
import { normalizeDomainNameFromUrl } from '@/utils/domain'

export const useRegistrationAvailabilityQuery = (routeName: string) => {
  const normalizedName = normalizeDomainNameFromUrl(routeName)

  return useQuery({
    ...getSearchNameQueryOptions(normalizedName),
    enabled: Boolean(normalizedName),
  })
}
