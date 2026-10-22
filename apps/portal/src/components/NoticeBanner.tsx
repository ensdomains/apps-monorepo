import {
  NOTICE_BANNER_FLAG,
  type NoticeBannerVariant,
  readNoticeBanner,
} from '@ens-apps/utils/posthog/notice-banner'
import { useFeatureFlagEnabled, useFeatureFlagPayload } from '@posthog/react'
import { useState } from 'react'
import { Alert, AlertClose, AlertDescription } from '@/components/ui/alert'
import { envConfig } from '@/config'

// Stores the dismissed text, so a changed notice shows again.
const NOTICE_DISMISSED_KEY = 'notice-dismissed'

const ALERT_VARIANTS = {
  info: 'default',
  warning: 'warning',
  danger: 'destructive',
  success: 'success',
} as const satisfies Record<NoticeBannerVariant, string>

export const NoticeBanner = () => {
  const isEnabled = useFeatureFlagEnabled(NOTICE_BANNER_FLAG)
  const payload = useFeatureFlagPayload(NOTICE_BANNER_FLAG)
  const notice =
    isEnabled === true
      ? readNoticeBanner(payload, {
          app: 'explorer',
          chainId: envConfig.chain.id,
        })
      : null
  const [dismissedMessage, setDismissedMessage] = useState(() =>
    window.localStorage.getItem(NOTICE_DISMISSED_KEY),
  )

  if (notice === null || dismissedMessage === notice.message) return null

  const dismissBanner = () => {
    window.localStorage.setItem(NOTICE_DISMISSED_KEY, notice.message)
    setDismissedMessage(notice.message)
  }

  return (
    <div className="w-full px-4 py-3 sm:px-6">
      <Alert
        className="mx-auto max-w-7xl"
        variant={ALERT_VARIANTS[notice.variant]}
      >
        <AlertDescription className="pr-10">{notice.message}</AlertDescription>
        <AlertClose onClick={dismissBanner} />
      </Alert>
    </div>
  )
}
