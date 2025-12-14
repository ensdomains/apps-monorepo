import { useMemo } from 'react'
import { useParaAccount } from '@/features/wallet/hooks/useParaAccount'
import { useSmartAccount } from '@/lib/smart-account'
import { type FeatureFlag, isFeatureEnabled } from '@/utils/feature-flags'

export function useFeatureFlag(flag: FeatureFlag): boolean {
  const { accountAddress } = useSmartAccount()
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
