import { Domain_OrderBy, OrderDirection } from '@ens-apps/indexer'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import type { Address } from 'viem'
import { getDomains } from '@/features/dashboard/service/queries/getDashboardDomains'

export const profileOwnedNamesQuery = (address?: Address) =>
  resultQueryOptions({
    queryKey: qk('profile', 'owned_names', { address }),
    queryFn: address
      ? () =>
          getDomains({
            where: { owner: address.toLowerCase() },
            first: 10,
            orderBy: Domain_OrderBy.RegistrationDate,
            orderDirection: OrderDirection.Desc,
          })
      : skipToken,
  })
