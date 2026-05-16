import { Trans } from '@lingui/react/macro'
import { Calendar } from 'lucide-react'

export const GracePeriodBadge = () => (
  <span className="inline-flex h-5 items-center justify-center gap-1.5 rounded-xl bg-ens-citrine-50 px-2 py-1 font-sans text-ens-citrine-500 text-xs leading-none">
    <Trans>Grace period</Trans>
    <Calendar className="size-3 shrink-0" strokeWidth={2} />
  </span>
)
