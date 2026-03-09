import { getTokenPrices } from '@/features/register/services/nameChainContractService'
import { normalizeDomainNameFromUrl } from '@/utils/domain'

interface RegistrationV2PricingQuoteQueryOptionsParams {
  routeName: string
  durationYears: number
}

export const getRegistrationV2PricingQuoteQueryOptions = ({
  routeName,
  durationYears,
}: RegistrationV2PricingQuoteQueryOptionsParams) => {
  const normalizedName = normalizeDomainNameFromUrl(routeName)

  return {
    queryKey: [
      'registration-v2',
      'pricing-quote',
      normalizedName,
      durationYears,
    ],
    queryFn: () => getTokenPrices(normalizedName, durationYears),
    enabled: Boolean(normalizedName) && durationYears > 0,
  }
}
