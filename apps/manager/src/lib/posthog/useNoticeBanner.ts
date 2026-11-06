import {
  type NoticeBanner,
  readNoticeBanner,
} from '@ens-apps/utils/posthog/noticeBanner'
import {
  useFeatureFlagEnabled,
  useFeatureFlagPayload,
} from '@ens-apps/utils/posthog/useFeatureFlags'
import posthog from 'posthog-js/dist/module.full.no-external'
import { chain } from '@/config'
import { POSTHOG_FEATURE_FLAGS } from './feature-flags'

export const useNoticeBanner = (): NoticeBanner | null => {
  const isEnabled = useFeatureFlagEnabled(
    posthog,
    POSTHOG_FEATURE_FLAGS.NOTICE_BANNER,
  )
  const payload = useFeatureFlagPayload(
    posthog,
    POSTHOG_FEATURE_FLAGS.NOTICE_BANNER,
  )
  if (isEnabled !== true) return null
  return readNoticeBanner(payload, { app: 'manager', chainId: chain.id })
}
