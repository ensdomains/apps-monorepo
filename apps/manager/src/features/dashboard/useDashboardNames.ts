import { useQuery } from '@tanstack/react-query'
import type { DashboardName } from './dashboardNames'
import { getDashboardNamesQuery } from './service/queries/getDashboardNames'
import { useDashboardOwnerAddresses } from './useDashboardOwnerAddresses'

const EMPTY_NAMES: readonly DashboardName[] = []

/**
 * The names the connected wallet, its smart account and the account owner
 * hold, ENSv1 and ENSv2 alike, plus renewable former-owned ENSv2 names.
 * Each address requires a current-authority walk and a bounded grace walk.
 */
export const useDashboardNames = () => {
  const ownerAddresses = useDashboardOwnerAddresses()

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
