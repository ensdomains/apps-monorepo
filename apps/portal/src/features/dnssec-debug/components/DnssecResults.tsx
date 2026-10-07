import { useQuery } from '@tanstack/react-query'
import { ClipboardCopy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import { useTrackDnssecDebugResult } from '../hooks/useTrackDnssecDebug'
import { getDnssecOracleCheckQueryOptions } from '../queries/getDnssecOracleCheck'
import type { DnssecReport, DnssecStep, RecordPurpose } from '../types'
import { formatReport } from '../utils/formatReport'
import { buildOracleRequest } from '../utils/oracle'
import { deriveVerdict, getStepPath, type OracleState } from '../utils/verdict'
import { DnssecOracleSection } from './DnssecOracleSection'
import { DnssecStepItem } from './DnssecStepItem'
import { DnssecSummary } from './DnssecSummary'

/**
 * Steps after a broken zone they depend on can't be trusted, whatever they
 * say. A broken `_ens` zone leaves the apex record alone.
 */
const getUntrusted = (
  report: DnssecReport,
  steps: readonly DnssecStep[],
): readonly boolean[] => {
  const firstBroken = (path: RecordPurpose | null) => {
    const index = report.zones.findIndex(
      (zone) => zone.status === 'fail' && getStepPath(report, zone) === path,
    )
    return index === -1 ? Number.POSITIVE_INFINITY : index
  }
  const shared = firstBroken(null)
  const onchain = firstBroken('onchain')
  return steps.map(
    (step, index) =>
      index > shared ||
      (index > onchain && getStepPath(report, step) === 'onchain'),
  )
}

const copyReport = async (text: string) => {
  await navigator.clipboard.writeText(text)
  toast.success('Report copied — paste it into your support request.')
}

type DnssecResultsProps = {
  /** The name as shown in ENS (the report carries its DNS A-label form). */
  readonly name: string
  readonly report: DnssecReport
}

export const DnssecResults = ({ name, report }: DnssecResultsProps) => {
  const request = buildOracleRequest(report)
  const oracleQuery = useQuery({
    ...getDnssecOracleCheckQueryOptions(request),
    enabled: request.entries.length > 0,
  })
  const oracleErrorMessage = oracleQuery.error
    ? extractErrorMessage(oracleQuery.error)
    : null
  const oracleState: OracleState = oracleQuery.data
    ? { status: 'checked', result: oracleQuery.data }
    : oracleErrorMessage !== null
      ? { status: 'unavailable', message: oracleErrorMessage }
      : { status: 'not-checked' }
  const verdict = deriveVerdict(report, oracleState)
  useTrackDnssecDebugResult({
    name,
    verdict: oracleQuery.isLoading ? null : verdict,
  })

  const steps: readonly DnssecStep[] = [...report.zones, ...report.records]
  const untrusted = getUntrusted(report, steps)

  return (
    <div className="flex flex-col gap-8">
      <DnssecSummary name={name} verdict={verdict} />

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-caps leading-none">Chain of trust</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void copyReport(
                formatReport({ report, verdict, oracle: oracleQuery.data }),
              )
            }
          >
            <ClipboardCopy className="size-4" />
            Copy report
          </Button>
        </div>
        <ol>
          {steps.map((step, index) => (
            <DnssecStepItem
              key={
                step.kind === 'zone'
                  ? `zone-${step.zone}`
                  : `record-${step.owner}`
              }
              step={step}
              isLast={index === steps.length - 1}
              isUntrusted={untrusted[index] ?? false}
            />
          ))}
        </ol>
      </section>

      <DnssecOracleSection
        request={request}
        check={oracleQuery.data}
        isLoading={oracleQuery.isLoading}
        errorMessage={oracleErrorMessage}
      />
    </div>
  )
}
