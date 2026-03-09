import { useQuery } from '@tanstack/react-query'
import { getTokenPrices } from '@/features/register/services/nameChainContractService'
import { normalizeDomainNameFromUrl } from '@/utils/domain'

interface UseRegistrationPricingQuoteQueryParams {
  routeName: string
  durationYears: number
}

export const useRegistrationPricingQuoteQuery = ({
  routeName,
  durationYears,
}: UseRegistrationPricingQuoteQueryParams) => {
  const normalizedName = normalizeDomainNameFromUrl(routeName)

  return useQuery({
    queryKey: [
      'registration-v2',
      'pricing-quote',
      normalizedName,
      durationYears,
    ],
    queryFn: () => getTokenPrices(normalizedName, durationYears),
    enabled: Boolean(normalizedName) && durationYears > 0,
  })
}
