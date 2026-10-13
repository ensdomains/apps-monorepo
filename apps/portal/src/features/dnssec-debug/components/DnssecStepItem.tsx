import { ChevronRight } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { CheckStatus, DnssecCheck, DnssecStep } from '../types'
import { getRecordLines } from '../utils/recordLines'
import { getStepLabel } from '../utils/verdict'
import { STATUS_FILL_CLASS, StatusBadge, StatusIcon } from './StatusIcon'

const STEP_BADGE: Readonly<Record<CheckStatus, string>> = {
  pass: 'Valid',
  warn: 'Warning',
  fail: 'Broken',
  skip: 'Not set',
}

const getStepCaption = (step: DnssecStep): string => {
  if (step.kind === 'record') {
    return step.purpose === 'onchain'
      ? 'Onchain import record'
      : 'Gasless (ENS1) record'
  }
  if (step.parent === null) return 'Root zone'
  return step.parent === '.' ? 'Top-level domain' : 'Zone'
}

const CheckRow = ({ check }: { readonly check: DnssecCheck }) => (
  <li className="flex items-start gap-2">
    <StatusIcon status={check.status} className="mt-0.5" />
    <div className="flex flex-col min-w-0">
      <span className="text-p font-medium">{check.title}</span>
      {check.detail && (
        <span className="text-p text-muted-foreground whitespace-pre-line wrap-break-word">
          {check.detail}
        </span>
      )}
    </div>
  </li>
)

const RecordsDisclosure = ({
  lines,
  isDefaultOpen,
}: {
  readonly lines: readonly string[]
  readonly isDefaultOpen: boolean
}) => (
  <Collapsible defaultOpen={isDefaultOpen} className="group/records">
    <CollapsibleTrigger className="inline-flex items-center gap-1 text-base text-muted-foreground hover:text-foreground cursor-pointer">
      <ChevronRight className="size-4 transition-transform group-data-[state=open]/records:rotate-90" />
      {lines.length} {lines.length === 1 ? 'record' : 'records'}
    </CollapsibleTrigger>
    <CollapsibleContent>
      <pre className="mt-2 rounded-md bg-neutral-1 p-3 text-smallmono leading-relaxed overflow-x-auto">
        {lines.join('\n')}
      </pre>
    </CollapsibleContent>
  </Collapsible>
)

type DnssecStepItemProps = {
  readonly step: DnssecStep
  readonly isLast: boolean
  /** An earlier link failed, so nothing here can be trusted regardless. */
  readonly isUntrusted: boolean
}

export const DnssecStepItem = ({
  step,
  isLast,
  isUntrusted,
}: DnssecStepItemProps) => {
  const lines = getRecordLines(step)
  return (
    <li className="flex gap-4">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full',
            STATUS_FILL_CLASS[step.status],
          )}
        >
          <StatusIcon status={step.status} />
        </span>
        {!isLast && <span aria-hidden className="w-px flex-1 bg-border" />}
      </div>
      <div
        className={cn(
          'flex flex-1 min-w-0 flex-col gap-3 pb-8',
          isUntrusted && 'opacity-70',
        )}
      >
        <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono text-p font-medium break-all">
            {getStepLabel(step)}
          </span>
          <span className="text-base text-muted-foreground">
            {getStepCaption(step)}
          </span>
          <StatusBadge status={step.status} className="ml-auto">
            {STEP_BADGE[step.status]}
          </StatusBadge>
        </div>
        {isUntrusted && (
          <p className="text-p text-muted-foreground">
            Not trusted — a link above this one is broken.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {step.checks.map((check) => (
            <CheckRow key={`${check.id}-${check.title}`} check={check} />
          ))}
        </ul>
        {lines.length > 0 && (
          <RecordsDisclosure
            lines={lines}
            isDefaultOpen={step.status === 'fail'}
          />
        )}
      </div>
    </li>
  )
}
