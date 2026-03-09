import { getSearchNameQueryOptions } from '@/features/register/services/checkNameAvailabilityService'
import { normalizeDomainNameFromUrl } from '@/utils/domain'

export const getRegistrationV2AvailabilityQueryOptions = (routeName: string) =>
  getSearchNameQueryOptions(normalizeDomainNameFromUrl(routeName))
