import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { okAsync } from 'neverthrow'
import { checkRealNameAvailability } from '@/features/register/services/nameChainContractService'
import { normalizeDomainNameFromUrl } from '@/utils/domain'
import {
  buildMockedAvailability,
  isTempPremiumMocked,
} from '../mocks/tempPremiumMock'

export const getRegistrationV2AvailabilityQueryOptions = (
  routeName: string,
) => {
  const normalizedName = normalizeDomainNameFromUrl(routeName)
  // Strip `.eth` to compare against the mock label list.
  const labelOnly = normalizedName.replace(/\.eth$/, '')

  return resultQueryOptions({
    queryKey: $qk({
      $scope: 'register-v2',
      $action: 'checkAvailability',
      name: normalizedName,
    }),
    queryFn: () =>
      // Dev simulation: force the route loader's guard to treat the label as
      // available so we can navigate into the pricing step. See
      // mocks/tempPremiumMock.ts for the env var setup.
      isTempPremiumMocked(labelOnly)
        ? okAsync(buildMockedAvailability(labelOnly))
        : checkRealNameAvailability(normalizedName),
    enabled: Boolean(normalizedName),
  })
}
