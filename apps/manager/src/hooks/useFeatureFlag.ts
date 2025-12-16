import { useMemo } from 'react'
import { useParaAccount } from '@/features/wallet/hooks/useParaAccount'
import { useSmartAccountContext } from '@/lib/smart-account'
import { type FeatureFlag, isFeatureEnabled } from '@/utils/feature-flags'

export function useFeatureFlag(flag: FeatureFlag): boolean {
  const { accountAddress } = useSmartAccountContext()
  const { userProfile } = useParaAccount()

  return useMemo(
    () =>
      isFeatureEnabled(flag, {
        walletAddress: accountAddress,
        email: userProfile?.email ?? null,
        phone: userProfile?.phone ?? null,
      }),
    [flag, accountAddress, userProfile?.email, userProfile?.phone],
  )
}
