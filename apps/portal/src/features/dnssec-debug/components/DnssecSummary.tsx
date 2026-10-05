import { Link } from '@tanstack/react-router'
import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react'
import { match } from 'ts-pattern'
import { Button } from '@/components/ui/button'
import { SupportLinkList } from '@/features/dns-import/components/SupportLinkList'
import { DNSSEC_HELP_LINKS } from '@/features/dns-import/constants'
import { cn } from '@/lib/utils'
import { type DnssecVerdict, describeVerdict } from '../utils/verdict'

type Tone = 'success' | 'warning' | 'danger'

const getTone = (verdict: DnssecVerdict): Tone =>
  match(verdict)
    .with({ kind: 'valid', warnings: 0 }, () => 'success' as const)
    .with(
      { kind: 'valid' },
      { kind: 'no-records' },
      { kind: 'oracle-unavailable' },
      () => 'warning' as const,
    )
    .otherwise(() => 'danger' as const)

const TONE_CLASS: Readonly<Record<Tone, string>> = {
  success: 'bg-message-success-fill text-message-success-text',
  warning: 'bg-message-warning-fill text-message-warning-text',
  danger: 'bg-message-danger-fill text-message-danger-text',
}

const TONE_ICON = {
  success: ShieldCheck,
  warning: ShieldAlert,
  danger: ShieldX,
} as const

/** Registrar guides help when the fix is at the registrar: enabling DNSSEC or the DS record. */
const needsRegistrarHelp = (verdict: DnssecVerdict): boolean =>
  verdict.kind === 'not-enabled' ||
  (verdict.kind === 'broken' &&
    (verdict.check.id === 'ds-records' || verdict.check.id === 'ds-match'))

type DnssecSummaryProps = {
  readonly name: string
  readonly verdict: DnssecVerdict
}

export const DnssecSummary = ({ name, verdict }: DnssecSummaryProps) => {
  const tone = getTone(verdict)
  const Icon = TONE_ICON[tone]
  const { title, description } = describeVerdict(verdict, name)

  return (
    <section
      aria-live="polite"
      className={cn('rounded-xl p-6 flex items-start gap-3', TONE_CLASS[tone])}
    >
      <Icon className="size-6 shrink-0 mt-0.5" strokeWidth={1.5} />
      <div className="flex flex-col gap-3 min-w-0">
        <h2 className="font-serif text-3xl font-normal leading-none tracking-[-0.02em] wrap-break-word">
          {title}
        </h2>
        <p className="text-p wrap-break-word">{description}</p>
        {needsRegistrarHelp(verdict) && (
          <SupportLinkList
            title="Registrar guides for enabling DNSSEC:"
            items={DNSSEC_HELP_LINKS}
          />
        )}
        {verdict.kind === 'no-records' && (
          <Button asChild className="self-start">
            <Link
              to="/import/$name"
              params={{ name }}
              search={{ type: 'offchain', step: 'start' }}
            >
              Set up ENS records
            </Link>
          </Button>
        )}
      </div>
    </section>
  )
}
