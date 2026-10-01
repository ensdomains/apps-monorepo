import { useFeatureFlagEnabled } from '@posthog/react'
import { isMigrationNftEnabled, POSTHOG_FEATURE_FLAGS } from './feature-flags'

export const useMigrationNftEnabled = (): boolean => {
  const migrationEnabled = useFeatureFlagEnabled(
    POSTHOG_FEATURE_FLAGS.MIGRATION,
    false,
  )
  const migrationNftEnabled = useFeatureFlagEnabled(
    POSTHOG_FEATURE_FLAGS.MIGRATION_NFT,
    false,
  )

  return isMigrationNftEnabled({
    network: import.meta.env.VITE_ENS_NETWORK,
    migrationEnabled,
    migrationNftEnabled,
  })
}
