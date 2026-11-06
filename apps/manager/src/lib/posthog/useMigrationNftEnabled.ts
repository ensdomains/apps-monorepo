import { useFeatureFlagEnabled } from '@ens-apps/utils/posthog/useFeatureFlags'
import posthog from 'posthog-js/dist/module.full.no-external'
import { envConfig } from '@/config'
import { isMigrationNftEnabled, POSTHOG_FEATURE_FLAGS } from './feature-flags'

export const useMigrationNftEnabled = (): boolean => {
  const migrationNftEnabled = useFeatureFlagEnabled(
    posthog,
    POSTHOG_FEATURE_FLAGS.MIGRATION_NFT,
  )

  return isMigrationNftEnabled({
    network: envConfig.network,
    migrationNftEnabled,
  })
}
