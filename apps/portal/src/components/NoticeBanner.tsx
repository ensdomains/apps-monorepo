import {
  NOTICE_BANNER_FLAG,
  type NoticeBannerVariant,
  readNoticeBanner,
} from '@ens-apps/utils/posthog/noticeBanner'
import {
  readDismissedNoticeId,
  storeDismissedNoticeId,
} from '@ens-apps/utils/posthog/noticeDismissal'
import { useCssHeightVariable } from '@ens-apps/utils/useCssHeightVariable'
import { useFeatureFlagEnabled, useFeatureFlagPayload } from '@posthog/react'
import { XIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { envConfig } from '@/config'
import { cn } from '@/lib/utils'

const VARIANT_CLASSES: Record<NoticeBannerVariant, string> = {
  info: 'bg-type-entity-fill text-type-entity-text',
  warning: 'bg-message-warning-fill text-message-warning-text',
  danger: 'bg-message-danger-fill text-message-danger-text',
  success: 'bg-message-success-fill text-message-success-text',
}

/** Full-width strip at the top of the viewport; the sidebar and mobile header sit below it. */
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
  // Any change to the notice in PostHog gives it a new id, so it shows again.
  const [dismissedId, setDismissedId] = useState(readDismissedNoticeId)
  const isDismissible = notice?.variant !== 'danger'
  const isShown =
    notice !== null && !(isDismissible && dismissedId === notice.id)
  const ref = useRef<HTMLDivElement>(null)
  useCssHeightVariable(ref, '--notice-bar-h')

  if (!isShown) return null

  const dismiss = () => {
    storeDismissedNoticeId(notice.id)
    setDismissedId(notice.id)
  }

  return (
    <div
      className={cn(
        'sticky top-0 z-30 flex w-full items-center gap-3 px-4 py-2 text-small',
        VARIANT_CLASSES[notice.variant],
      )}
      ref={ref}
      role="status"
    >
      <p className="min-w-0 flex-1 text-center">{notice.message}</p>
      {isDismissible && (
        <button
          aria-label="Dismiss notice"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-xs opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={dismiss}
          type="button"
        >
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  )
}
