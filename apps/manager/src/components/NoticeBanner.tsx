import type { NoticeBannerVariant } from '@ens-apps/utils/posthog/noticeBanner'
import { useCssHeightVariable } from '@ens-apps/utils/useCssHeightVariable'
import { useLingui } from '@lingui/react/macro'
import { XIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNoticeBanner } from '@/lib/posthog/useNoticeBanner'
import { tw } from '@/utils/tailwind'

// Stores the dismissed notice id, so any change to it shows the notice again.
const NOTICE_DISMISSED_KEY = 'notice-dismissed'

const VARIANT_CLASSES: Record<NoticeBannerVariant, string> = {
  info: 'bg-ens-lapis-bg text-ens-lapis-dense',
  warning: 'bg-amber-50 text-amber-900',
  danger: 'bg-ens-signal-danger-100 text-ens-signal-danger-700',
  success: 'bg-ens-signal-success-100 text-ens-signal-success-700',
}

/** Full-width strip above the header; the sticky header sits below it. */
export const NoticeBanner = () => {
  const { t } = useLingui()
  const notice = useNoticeBanner()
  // Server render has no storage; flags are client-only too, so nothing shows there.
  const [dismissedId, setDismissedId] = useState(() =>
    typeof window === 'undefined'
      ? null
      : window.localStorage.getItem(NOTICE_DISMISSED_KEY),
  )
  const isDismissible = notice?.variant !== 'danger'
  const isShown =
    notice !== null && !(isDismissible && dismissedId === notice.id)
  const ref = useRef<HTMLDivElement>(null)
  useCssHeightVariable(ref, '--notice-bar-h')

  if (!isShown) return null

  const dismiss = () => {
    window.localStorage.setItem(NOTICE_DISMISSED_KEY, notice.id)
    setDismissedId(notice.id)
  }

  return (
    <div
      className={tw(
        'sticky top-0 z-40 flex w-full items-center gap-3 px-4 py-2 text-sm',
        VARIANT_CLASSES[notice.variant],
      )}
      ref={ref}
      role="status"
    >
      <p className="min-w-0 flex-1 text-center">{notice.message}</p>
      {isDismissible && (
        <button
          aria-label={t`Dismiss notice`}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={dismiss}
          type="button"
        >
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  )
}
