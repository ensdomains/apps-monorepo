import {
  Domain_OrderBy,
  type DomainFragment,
  OrderDirection,
} from '@ens-apps/indexer'
import { useWallet } from '@getpara/react-sdk-lite'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { match } from 'ts-pattern'
import { getDomainsQuery } from '../service/queries/getDashboardDomains'

const PAGE_SIZE = 5

export type SortField = 'name' | 'expiry' | 'registration'

export const useDashboardNames = ({
  searchQuery,
}: {
  searchQuery?: string
}) => {
  const { data: wallet } = useWallet()
  const [page, setPage] = useState(1)
  const [sortField, setSortField] = useState<SortField>('registration')
  const [sortDirection, setSortDirection] = useState<OrderDirection | null>(
    null,
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: Reset page on search change
  useEffect(() => {
    setPage(1)
  }, [searchQuery, wallet?.address])

  const normalizedAddress = wallet?.address?.toLowerCase()

  const orderBy = match(sortField)
    .with('name', () => Domain_OrderBy.Name)
    .with('expiry', () => Domain_OrderBy.ExpiryDate)
    .with('registration', () => Domain_OrderBy.RegistrationDate)
    .exhaustive()

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
        orderBy,
        orderDirection: sortDirection ?? OrderDirection.Desc,
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

  const handleSort = (field: SortField, direction?: OrderDirection) => {
    if (direction !== undefined) {
      setSortField(field)
      setSortDirection(direction)
    } else if (sortField === field && sortDirection !== null) {
      setSortDirection((prev) =>
        prev === OrderDirection.Desc ? OrderDirection.Asc : OrderDirection.Desc,
      )
    } else {
      setSortField(field)
      setSortDirection(
        field === 'expiry' ? OrderDirection.Asc : OrderDirection.Desc,
      )
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
    sortField,
    sortDirection,
    handleSort,
  }
}
