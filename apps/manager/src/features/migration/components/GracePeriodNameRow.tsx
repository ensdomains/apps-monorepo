import { Trans } from '@lingui/react/macro'
import { ExternalLink } from 'lucide-react'
import { useId } from 'react'
import { PatternAvatar } from '@/components/atoms/PatternAvatar/PatternAvatar'
import { MSymbol } from '@/components/ui/material-symbol'
import { getRenewalRoute } from '@/features/renew/utils/renewalProtocol'

type GracePeriodNameRowProps = {
  readonly name: string
  readonly isPrimary?: boolean
}

export const GracePeriodNameRow = ({
  name,
  isPrimary = false,
}: GracePeriodNameRowProps) => {
  const statusId = useId()
  const primaryNameId = useId()

  return (
    <div className="flex w-full min-w-0 items-center gap-3">
      <label
        className="flex min-w-0 flex-1 cursor-not-allowed items-center gap-3"
        title={name}
      >
        <input
          aria-describedby={
            isPrimary ? `${statusId} ${primaryNameId}` : statusId
          }
          aria-label={name}
          checked={false}
          className="sr-only"
          disabled
          type="checkbox"
        />
        <span
          aria-hidden
          className="size-4.5 shrink-0 rounded-sm border border-ens-garnet-900/25 bg-white/20"
        />
        <div aria-hidden className="size-9 shrink-0 opacity-60 grayscale">
          <PatternAvatar
            className="size-full rounded-md border-none shadow-none"
            name={name}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium font-semi-mono text-base text-ens-garnet-900/80 leading-5 tracking-tight md:text-lg">
              {name}
            </span>
            {isPrimary && (
              <span className="shrink-0 text-ens-garnet-900/70">
                <MSymbol
                  aria-hidden
                  className="ms-wght-300 text-base leading-none"
                  symbol="person_check"
                />
                <span className="sr-only" id={primaryNameId}>
                  <Trans>Primary name</Trans>
                </span>
              </span>
            )}
          </div>
          <span
            className="text-ens-garnet-900/70 text-xs leading-4"
            id={statusId}
          >
            <Trans>Grace period</Trans>
          </span>
        </div>
      </label>
      <a
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 font-medium text-ens-garnet-900 text-sm underline-offset-4 transition-colors hover:bg-white/50 hover:underline focus-visible:outline-2 focus-visible:outline-ens-garnet-900 focus-visible:outline-offset-2 motion-reduce:transition-none"
        href={getRenewalRoute('v1').replace('$name', encodeURIComponent(name))}
        rel="noopener noreferrer"
        target="_blank"
      >
        <Trans>Renew</Trans>
        <ExternalLink aria-hidden className="size-3.5" />
        <span className="sr-only"> {name}</span>
      </a>
    </div>
  )
}
