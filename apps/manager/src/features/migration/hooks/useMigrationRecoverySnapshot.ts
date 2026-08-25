import { useMemo } from 'react'
import type { Address } from 'viem'
import { usePublicClient } from 'wagmi'
import { useSmartAccountContext } from '@/lib/smart-account'
import { loadMigrationRecoverySnapshot } from '../service/migrationBatchJournal'

export const useMigrationRecoverySnapshot = () => {
  const publicClient = usePublicClient()
  const { ownerAddress, accountAddress: hcaAddress } = useSmartAccountContext()
  const chainId = publicClient?.chain?.id

  return useMemo(() => {
    if (
      !chainId ||
      !ownerAddress ||
      !hcaAddress ||
      typeof globalThis.localStorage === 'undefined'
    ) {
      return null
    }
    return loadMigrationRecoverySnapshot({
      chainId,
      owner: ownerAddress as Address,
      hca: hcaAddress as Address,
    })
  }, [chainId, ownerAddress, hcaAddress])
}
