import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { Address, PublicClient } from 'viem'
import { primaryNameForwardAddressQuery } from '@/features/profile/service/primaryNameForwardAddress'
import { unreachableV1NameQuery } from '@/features/profile/service/primaryNamePreparation'
import { publicClient } from '@/lib/wagmi'
import {
  getPrimaryNameCandidates,
  getPrimaryNamePage,
} from '../components/ChoosePrimaryNameDialog.handlers'
import { primaryNameDomainsQuery } from '../service/queries/getPrimaryNameDomains'
import { resolveDomainLabel } from '../utils'

/** Search owned names and names resolving to the owner, resolving only this page and the selection. */
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
  } = useQuery(
    primaryNameDomainsQuery(
      open ? address : undefined,
      ownerAddress ?? undefined,
    ),
  )
  const allDomains = useMemo(() => getPrimaryNameCandidates(data ?? []), [data])
  const pagination = useMemo(
    () => getPrimaryNamePage(allDomains, { searchQuery, page, reverseName }),
    [allDomains, searchQuery, page, reverseName],
  )
  const selectedDomain = allDomains.find(
    (domain) => resolveDomainLabel(domain) === selectedName,
  )
  const ownsSelectedName = Boolean(selectedDomain)
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
  // A name with no ETH address may sit under an expired parent; only ENSv1
  // names can, since their registry keeps entries past expiry.
  const unreachableChecks = useQueries({
    queries: lookupNames.map((name, index) => ({
      ...unreachableV1NameQuery(publicClient as PublicClient, name),
      enabled:
        open &&
        forwardAddresses[index]?.data === null &&
        allDomains.some(
          (domain) =>
            resolveDomainLabel(domain) === name && domain.protocol === 'v1',
        ),
    })),
  })
  const unreachableNames: ReadonlySet<string> = new Set(
    lookupNames.filter((_, index) => unreachableChecks[index]?.data === true),
  )
  const isCheckingNames = [...forwardAddresses, ...unreachableChecks].some(
    (query) => query.isLoading,
  )
  const hasForwardAddressError = forwardAddresses.some((query) => query.isError)

  return {
    ...pagination,
    domains: pagination.domains.filter((domain) =>
      checkedNames.has(resolveDomainLabel(domain)),
    ),
    unreachableNames,
    isSelectedNameOffered:
      ownsSelectedName &&
      checkedNames.has(selectedName ?? '') &&
      !unreachableNames.has(selectedName ?? ''),
    selectedProtocol: selectedDomain?.protocol ?? null,
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
