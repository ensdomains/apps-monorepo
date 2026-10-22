import {
  type NoticeBanner,
  readNoticeBanner,
} from '@ens-apps/utils/posthog/notice-banner'
import { useFeatureFlagEnabled, useFeatureFlagPayload } from '@posthog/react'
import { chain } from '@/config'
import { POSTHOG_FEATURE_FLAGS } from './feature-flags'

export const useNoticeBanner = (): NoticeBanner | null => {
  const isEnabled = useFeatureFlagEnabled(POSTHOG_FEATURE_FLAGS.NOTICE_BANNER)
  const payload = useFeatureFlagPayload(POSTHOG_FEATURE_FLAGS.NOTICE_BANNER)
  if (isEnabled !== true) return null
  return readNoticeBanner(payload, { app: 'manager', chainId: chain.id })
}
