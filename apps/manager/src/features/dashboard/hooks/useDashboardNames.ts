import {
  Domain_OrderBy,
  type DomainFragment,
  OrderDirection,
} from '@ens-apps/indexer'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSmartAccount } from '@/lib/smart-account'
import { getDomainsQuery } from '../service/dashboardDomains'

const PAGE_SIZE = 5

export const useDashboardNames = ({
  searchQuery,
}: {
  searchQuery?: string
}) => {
  const { accountAddress } = useSmartAccount()
  const [page, setPage] = useState(1)

  // biome-ignore lint/correctness/useExhaustiveDependencies: Reset page on search change
  useEffect(() => {
    setPage(1)
  }, [searchQuery, accountAddress])

  const normalizedAddress = accountAddress?.toLowerCase()

  const queryVariables = normalizedAddress
    ? {
        where: {
          owner: normalizedAddress,
          ...(searchQuery
            ? { name_contains_nocase: searchQuery.toLowerCase() }
            : {}),
        },
        first: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
        orderBy: Domain_OrderBy.RegistrationDate,
        orderDirection: OrderDirection.Desc,
      }
    : undefined

  const { data, isPending, isError } = useQuery(getDomainsQuery(queryVariables))

  const names: DomainFragment[] =
    normalizedAddress && data?.domains ? data.domains : []

  const handlePrev = () => {
    if (!isPending && page > 1) {
      setPage((p) => p - 1)
    }
  }

  const handleNext = () => {
    if (!isPending && names.length === PAGE_SIZE) {
      setPage((p) => p + 1)
    }
  }

  return {
    names,
    isLoading: isPending,
    isError,
    page,
    handlePrev,
    handleNext,
    pageSize: PAGE_SIZE,
  }
}
