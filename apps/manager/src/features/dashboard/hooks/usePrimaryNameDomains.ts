import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { Address, PublicClient } from 'viem'
import { primaryNameForwardAddressQuery } from '@/features/profile/service/primaryNameForwardAddress'
import { publicClient } from '@/lib/wagmi'
import {
  getPrimaryNameCandidates,
  getPrimaryNamePage,
} from '../components/ChoosePrimaryNameDialog.handlers'
import { primaryNameDomainsQuery } from '../service/queries/getPrimaryNameDomains'
import { resolveDomainLabel } from '../utils'

/** Search all owned canonical names, resolving only this page and the selection. */
export const usePrimaryNameDomains = ({
  address,
  ownerAddress,
  open,
  reverseName,
  selectedName,
}: {
  readonly address: Address | undefined
  readonly ownerAddress: Address | null
  readonly open: boolean
  readonly reverseName: string | null | undefined
  readonly selectedName: string | null
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const filterKey = `${address}:${open}`
  const [previousFilterKey, setPreviousFilterKey] = useState(filterKey)
  if (filterKey !== previousFilterKey) {
    setPreviousFilterKey(filterKey)
    setSearchQuery('')
    setPage(1)
  }

  const {
    data,
    isLoading,
    isError: hasDomainsError,
  } = useQuery(primaryNameDomainsQuery(open ? address : undefined))
  const allDomains = useMemo(() => getPrimaryNameCandidates(data ?? []), [data])
  const pagination = useMemo(
    () => getPrimaryNamePage(allDomains, { searchQuery, page, reverseName }),
    [allDomains, searchQuery, page, reverseName],
  )
  const ownsSelectedName = allDomains.some(
    (domain) => resolveDomainLabel(domain) === selectedName,
  )
  const lookupNames = [
    ...new Set([
      ...pagination.domains.map(resolveDomainLabel),
      ...(ownsSelectedName && selectedName ? [selectedName] : []),
    ]),
  ]
  const forwardAddresses = useQueries({
    queries: lookupNames.map((name) => ({
      ...primaryNameForwardAddressQuery(publicClient as PublicClient, name),
      enabled: open && Boolean(ownerAddress),
    })),
  })
  const checkedNames = new Set(
    lookupNames.filter((_, index) => forwardAddresses[index]?.isSuccess),
  )
  const isCheckingNames = forwardAddresses.some((query) => query.isLoading)
  const hasForwardAddressError = forwardAddresses.some((query) => query.isError)

  return {
    ...pagination,
    domains: pagination.domains.filter((domain) =>
      checkedNames.has(resolveDomainLabel(domain)),
    ),
    isSelectedNameOffered:
      ownsSelectedName && checkedNames.has(selectedName ?? ''),
    isLoading: isLoading || isCheckingNames,
    hasForwardAddressError: hasDomainsError || hasForwardAddressError,
    searchQuery,
    onSearchChange: (query: string) => {
      setSearchQuery(query)
      setPage(1)
    },
    onPageChange: setPage,
  }
}
