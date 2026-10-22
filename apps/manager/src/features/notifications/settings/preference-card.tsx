import { Trans } from '@lingui/react/macro'
import { Loader2Icon } from 'lucide-react'
import type { ReactNode } from 'react'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface PreferenceCardProps {
  icon: ReactNode
  label: ReactNode
  description: ReactNode
  recommended?: boolean
  /** Info tooltip beside the label; `tooltipLabel` names it for assistive tech. */
  tooltip?: ReactNode
  tooltipLabel?: string
  checked: boolean
  disabled?: boolean
  isLoading?: boolean
  onChange: (checked: boolean) => void
}

export const PreferenceCard = ({
  icon,
  label,
  description,
  recommended = false,
  tooltip,
  tooltipLabel,
  checked,
  disabled,
  isLoading,
  onChange,
}: PreferenceCardProps) => {
  return (
    <button
      aria-pressed={checked}
      className={cn(
        'relative flex h-full w-full items-start gap-4 overflow-hidden rounded-lg border border-solid p-4 text-left transition-colors',
        checked
          ? 'border-ens-lapis-500 bg-ens-lapis-100'
          : 'border-[#dededf] bg-[#faf9f7] hover:bg-[#f1efeb]',
        (disabled || isLoading) &&
          'cursor-not-allowed opacity-60 hover:bg-inherit',
      )}
      disabled={disabled || isLoading}
      onClick={() => onChange(!checked)}
      type="button"
    >
      {checked ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 bottom-0 left-0 w-2.5 bg-ens-lapis-500"
        />
      ) : null}
      <div
        className={cn(
          'mt-0.5 shrink-0 text-ens-quartz-500',
          checked && 'text-ens-lapis-500',
        )}
      >
        {isLoading ? <Loader2Icon className="size-5 animate-spin" /> : icon}
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-normal font-sans text-base text-ens-blue-dark not-italic leading-[22.5px]">
            {label}
          </span>
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                {/* biome-ignore lint/a11y/useSemanticElements: a <button> cannot nest inside the card's button */}
                <span
                  aria-label={tooltipLabel}
                  className="-ml-1.5 flex items-center text-ens-quartz-500"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  role="button"
                  tabIndex={0}
                >
                  <MSymbol className="ms-opsz-20 ms-wght-400" symbol="info" />
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-64 text-center">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          )}
          {recommended && (
            <span className="rounded bg-white px-2 py-0.5 font-normal font-sans text-ens-blue-dark text-xs not-italic leading-ens-normal">
              <Trans>Recommended</Trans>
            </span>
          )}
        </div>
        <p className="font-normal font-sans text-slate-600 text-sm not-italic leading-[18.2px]">
          {description}
        </p>
      </div>
    </button>
  )
}
