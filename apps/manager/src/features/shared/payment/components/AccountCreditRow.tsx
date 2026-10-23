import { Trans } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'

export const AccountCreditRow = ({
  credit,
  label,
  isLoading,
}: {
  readonly label?: ReactNode
  readonly credit: number
  readonly isLoading: boolean
}) => (
  <div className="flex items-baseline justify-between gap-4 text-sm">
    <dt>{label ?? <Trans>Balance from a previous attempt</Trans>}</dt>
    <dd
      className={
        isLoading
          ? 'animate-pulse whitespace-nowrap tabular-nums'
          : 'whitespace-nowrap tabular-nums'
      }
    >
      -{formatUsd(credit)}
    </dd>
  </div>
)
