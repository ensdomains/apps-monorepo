import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { Address, PublicClient } from 'viem'
import { primaryNameForwardAddressQuery } from '@/features/profile/service/primaryNameForwardAddress'
import { getUnreachableV1NameQueryOptions } from '@/features/profile/service/primaryNamePreparation'
import { publicClient } from '@/lib/wagmi'
import {
  getPrimaryNameCandidates,
  getPrimaryNamePage,
} from '../components/ChoosePrimaryNameDialog.handlers'
import {
  mergePrimaryNameDomains,
  ownedPrimaryNamesQuery,
  resolvingPrimaryNamesQuery,
} from '../service/queries/getPrimaryNameDomains'
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
    data: owned,
    isLoading,
    isError: hasDomainsError,
  } = useQuery(ownedPrimaryNamesQuery(open ? address : undefined))
  // Owned names don't wait for this read, and a failure only adds a notice.
  const {
    data: resolving,
    isLoading: isLoadingResolvingNames,
    isError: hasResolvingNamesError,
  } = useQuery(
    resolvingPrimaryNamesQuery(open ? (ownerAddress ?? undefined) : undefined),
  )
  const allDomains = useMemo(
    () =>
      getPrimaryNameCandidates(
        mergePrimaryNameDomains(owned ?? [], resolving ?? []),
      ),
    [owned, resolving],
  )
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
  // A name with no ETH address may sit under an expired parent; only ENSv1
  // names can, since their registry keeps entries past expiry.
  const needsReachCheck = lookupNames.map(
    (name, index) =>
      forwardAddresses[index]?.data === null &&
      allDomains.some(
        (domain) =>
          resolveDomainLabel(domain) === name && domain.protocol === 'v1',
      ),
  )
  const unreachableChecks = useQueries({
    queries: lookupNames.map((name, index) => ({
      ...getUnreachableV1NameQueryOptions(publicClient as PublicClient, name),
      enabled: open && needsReachCheck[index],
    })),
  })
  const unreachableNames: ReadonlySet<string> = new Set(
    lookupNames.filter((_, index) => unreachableChecks[index]?.data === true),
  )
  // A row waits only for its own checks, so one slow read hides one name.
  const checkedNames = new Set(
    lookupNames.filter(
      (_, index) =>
        forwardAddresses[index]?.isSuccess &&
        !(needsReachCheck[index] && unreachableChecks[index]?.isPending),
    ),
  )
  const isCheckingNames = forwardAddresses.some((query) => query.isLoading)
  const isCheckingReach = needsReachCheck.some(
    (needsCheck, index) => needsCheck && unreachableChecks[index]?.isPending,
  )
  const domains = pagination.domains.filter((domain) =>
    checkedNames.has(resolveDomainLabel(domain)),
  )
  const hasForwardAddressError = [
    ...forwardAddresses,
    ...unreachableChecks,
  ].some((query) => query.isError)

  return {
    ...pagination,
    domains,
    unreachableNames,
    isSelectedNameOffered:
      ownsSelectedName &&
      checkedNames.has(selectedName ?? '') &&
      !unreachableNames.has(selectedName ?? ''),
    selectedProtocol: selectedDomain?.protocol ?? null,
    // Rows that are ready stay visible while late names are still checked.
    isLoading:
      isLoading ||
      ((isCheckingNames || isLoadingResolvingNames || isCheckingReach) &&
        domains.length === 0),
    hasForwardAddressError: hasDomainsError || hasForwardAddressError,
    hasResolvingNamesError,
    searchQuery,
    onSearchChange: (query: string) => {
      setSearchQuery(query)
      setPage(1)
    },
    onPageChange: setPage,
  }
}
