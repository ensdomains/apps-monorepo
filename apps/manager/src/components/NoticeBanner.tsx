import type { NoticeBannerVariant } from '@ens-apps/utils/posthog/notice-banner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { tw } from '@/utils/tailwind'

const ALERT_VARIANTS = {
  info: 'info',
  warning: 'warning',
  danger: 'danger',
  success: 'success',
} as const satisfies Record<NoticeBannerVariant, string>

export const NoticeBanner = ({
  message,
  variant,
  className,
}: {
  readonly message: string
  readonly variant: NoticeBannerVariant
  readonly className?: string
}) => (
  <Alert
    className={tw('mx-auto max-w-7xl', className)}
    variant={ALERT_VARIANTS[variant]}
  >
    <AlertDescription>{message}</AlertDescription>
  </Alert>
)
