import { Trans } from '@lingui/react/macro'
import { ExternalLink } from 'lucide-react'
import { useId } from 'react'
import { PatternAvatar } from '@/components/atoms/PatternAvatar/PatternAvatar'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
    <div className="flex max-w-full items-center gap-2">
      <label
        className="relative flex min-w-0 cursor-not-allowed items-center gap-1 opacity-50"
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
          className="size-4.5 shrink-0 rounded-sm border border-ens-quartz-500 bg-transparent"
        />
        <div
          aria-hidden
          className="relative z-10 size-9.25 shrink-0 overflow-hidden rounded-md bg-ens-garnet-900/10 grayscale"
        >
          <PatternAvatar
            className="size-full rounded-md border-none shadow-none"
            name={name}
          />
        </div>
        <div className="relative flex h-9.25 min-w-0 items-center rounded-md bg-white px-2 py-1 font-medium font-semi-mono text-base text-ens-quartz-500 leading-[0.96] tracking-[-0.32px] md:text-[20px] md:tracking-[-0.4px]">
          <span className="truncate">{name}</span>
          {isPrimary && (
            <span className="absolute -top-3.5 -right-3 flex size-7 items-center justify-center rounded-full border-3 border-white bg-ens-quartz-500 text-ens-quartz-50">
              <MSymbol
                aria-hidden
                className="ms-wght-300 size-4 text-base leading-none"
                symbol="person_check"
              />
              <span className="sr-only" id={primaryNameId}>
                <Trans>Primary name</Trans>
              </span>
            </span>
          )}
        </div>
        <span className="sr-only" id={statusId}>
          <Trans>Grace period</Trans>
        </span>
      </label>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            className="relative inline-flex size-7 shrink-0 items-center justify-center rounded-md text-ens-garnet-900 transition-colors before:absolute before:-inset-2 hover:bg-white/50 focus-visible:outline-2 focus-visible:outline-ens-garnet-900 focus-visible:outline-offset-2 motion-reduce:transition-none"
            href={getRenewalRoute('v1').replace(
              '$name',
              encodeURIComponent(name),
            )}
            rel="noopener noreferrer"
            target="_blank"
          >
            <ExternalLink aria-hidden className="size-3.5" />
            <span className="sr-only">
              <Trans>Renew</Trans> {name}
            </span>
          </a>
        </TooltipTrigger>
        <TooltipContent className="motion-reduce:animate-none">
          <Trans>Renew</Trans>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
