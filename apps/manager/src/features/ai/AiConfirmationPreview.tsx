import { Trans } from '@lingui/react/macro'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getAiConfirmationSummary } from './actionConfirmation'
import type { AiInterpretResult } from './intent'

export const AiConfirmationPreview = ({
  result,
  onConfirm,
  onEdit,
}: {
  readonly result: Extract<AiInterpretResult, { status: 'needs_confirmation' }>
  readonly onConfirm: () => void
  readonly onEdit: () => void
}) => {
  const summary = getAiConfirmationSummary(result.action)
  return (
    <div className="space-y-5">
      <p className="text-ens-quartz-500 text-sm leading-relaxed">
        <Trans>Check that I understood your request before continuing.</Trans>
      </p>
      <div className="space-y-4 rounded-xl border border-ens-quartz-200 bg-ens-quartz-50 p-4">
        <p className="font-medium text-ens-quartz-900">{summary.title}</p>
        {summary.rows.length ? (
          <dl className="space-y-3 text-sm">
            {summary.rows.map(({ label, value }) => (
              <div className="space-y-1" key={`${label}-${value}`}>
                <dt className="text-ens-quartz-500">{label}</dt>
                <dd className="whitespace-pre-wrap break-words text-ens-quartz-900 [overflow-wrap:anywhere]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
      {result.multiAction ? (
        <p className="text-ens-quartz-500 text-sm">
          This starts only the first action. Ask for{' '}
          {result.multiAction.nextIntent.replaceAll('_', ' ')} separately
          afterward.
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Button className="w-full" onClick={onConfirm} size="lg" type="button">
          <Trans>Yes, that’s what I meant</Trans>
          <ArrowRight aria-hidden="true" className="size-4" />
        </Button>
        <Button
          className="w-full"
          onClick={onEdit}
          type="button"
          variant="ghost"
        >
          <Trans>Edit my request</Trans>
        </Button>
      </div>
    </div>
  )
}
