import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { checkRealNameAvailability } from '@/features/register/services/nameChainContractService'
import { normalizeDomainNameFromUrl } from '@/utils/domain'

export const registrationV2AvailabilityQueryKey = createQueryKey<
  'registrationV2Availability',
  {
    name: string
  }
>('registrationV2Availability')

export const getRegistrationV2AvailabilityQueryOptions = (
  routeName: string,
) => {
  const normalizedName = normalizeDomainNameFromUrl(routeName)

  return resultQueryOptions({
    queryKey: registrationV2AvailabilityQueryKey({ name: normalizedName }),
    queryFn: ({ queryKey: [, { name }] }) => checkRealNameAvailability(name),
    enabled: Boolean(normalizedName),
  })
}
