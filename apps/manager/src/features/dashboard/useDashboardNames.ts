import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { type Address, getAddress } from 'viem'
import { useConnection } from 'wagmi'
import { useSmartAccountContextSafe } from '@/lib/smart-account/SmartAccountContext'
import { getDashboardNamesQueryOptions } from './service/queries/getDashboardNames'

export const useDashboardNames = () => {
  const { address } = useConnection()
  const smartAccount = useSmartAccountContextSafe()

  const addresses = useMemo(
    () =>
      Array.from(
        new Set(
          [address, smartAccount?.accountAddress, smartAccount?.ownerAddress]
            .filter((candidate): candidate is Address => !!candidate)
            .map((candidate) => getAddress(candidate)),
        ),
      ),
    [address, smartAccount?.accountAddress, smartAccount?.ownerAddress],
  )

  const { data, isPending, isError } = useQuery(
    getDashboardNamesQueryOptions(addresses),
  )
  const hasAddresses = addresses.length > 0

  return {
    names: data ?? [],
    hasAddresses,
    isPending: hasAddresses && isPending,
    isError,
  }
}
