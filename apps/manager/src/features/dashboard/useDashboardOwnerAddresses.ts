import { useMemo } from 'react'
import { useConnection } from 'wagmi'
import { useSmartAccountContextSafe } from '@/lib/smart-account/SmartAccountContext'

export const useDashboardOwnerAddresses = () => {
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

  return ownerAddresses
}
