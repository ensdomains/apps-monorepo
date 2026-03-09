import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getTokenPrices } from '@/features/register/services/nameChainContractService'
import { normalizeDomainNameFromUrl } from '@/utils/domain'

interface RegistrationV2PricingQuoteQueryOptionsParams {
  routeName: string
  durationYears: number
}

export const registrationV2PricingQuoteQueryKey = createQueryKey<
  'registrationV2PricingQuote',
  {
    name: string
    durationYears: number
  }
>('registrationV2PricingQuote')

export const getRegistrationV2PricingQuoteQueryOptions = ({
  routeName,
  durationYears,
}: RegistrationV2PricingQuoteQueryOptionsParams) => {
  const normalizedName = normalizeDomainNameFromUrl(routeName)

  return resultQueryOptions({
    queryKey: registrationV2PricingQuoteQueryKey({
      name: normalizedName,
      durationYears,
    }),
    queryFn: ({ queryKey: [, { name, durationYears }] }) =>
      getTokenPrices(name, durationYears),
    enabled: Boolean(normalizedName) && durationYears > 0,
  })
}
