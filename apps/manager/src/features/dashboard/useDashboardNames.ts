import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useConnection } from 'wagmi'
import { useSmartAccountContextSafe } from '@/lib/smart-account/SmartAccountContext'
import type { DashboardName } from './dashboardNames'
import { getDashboardNamesQuery } from './service/queries/getDashboardNames'

const EMPTY_NAMES: readonly DashboardName[] = []

/**
 * The names the connected wallet, its smart account and the account owner
 * hold, ENSv1 and ENSv2 alike, from one bigname collection per address.
 */
export const useDashboardNames = () => {
  const { address } = useConnection()
  const smartAccount = useSmartAccountContextSafe()

  const ownerAddresses = useMemo(() => {
    const candidates = [
      address,
      smartAccount?.accountAddress,
      smartAccount?.ownerAddress,
    ]
    const unique = new Set<string>()
    for (const addr of candidates) {
      if (addr) unique.add(addr.toLowerCase())
    }
    return Array.from(unique)
  }, [address, smartAccount?.accountAddress, smartAccount?.ownerAddress])

  const hasOwnerAddresses = ownerAddresses.length > 0
  const { data, isPending, isError } = useQuery(
    getDashboardNamesQuery(hasOwnerAddresses ? ownerAddresses : undefined),
  )
  const isNamesPending = hasOwnerAddresses && isPending

  return {
    names: data ?? EMPTY_NAMES,
    hasOwnerAddresses,
    isPending: isNamesPending,
    isError,
    // The query resolves only after every page of every address is read.
    isAllPagesLoaded: !isNamesPending,
  }
}
