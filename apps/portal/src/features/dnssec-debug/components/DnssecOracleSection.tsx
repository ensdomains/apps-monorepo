import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { getAlgorithmName, getDigestName } from '../constants'
import type {
  DnssecOracleCheck,
  OracleSupport,
} from '../queries/getDnssecOracleCheck'
import type { CheckStatus } from '../types'
import type { OracleOutcome, OracleRequest } from '../utils/oracle'
import type { OracleStepResult } from '../utils/verdict'
import { StatusBadge, StatusIcon } from './StatusIcon'

const OUTCOME_STATUS: Readonly<Record<OracleOutcome['status'], CheckStatus>> = {
  pass: 'pass',
  fail: 'fail',
  error: 'warn',
}

/** Rows after the first rejection are only rejected because of it. */
const withUnreached = (results: readonly OracleStepResult[]) => {
  const firstFailure = results.findIndex((r) => r.outcome.status === 'fail')
  return results.map((result, index) => ({
    ...result,
    isUnreached: firstFailure !== -1 && index > firstFailure,
  }))
}

const OutcomeRow = ({
  label,
  outcome,
  isUnreached,
}: OracleStepResult & { readonly isUnreached: boolean }) => (
  <li className="flex items-start gap-2">
    <StatusIcon
      status={isUnreached ? 'skip' : OUTCOME_STATUS[outcome.status]}
      className="mt-0.5"
    />
    <div className="flex flex-col min-w-0">
      <span className="font-mono text-sm">{label}</span>
      {isUnreached ? (
        <span className="text-sm text-muted-foreground">Not reached</span>
      ) : (
        outcome.status !== 'pass' && (
          <span className="text-sm text-muted-foreground wrap-break-word">
            {outcome.message}
          </span>
        )
      )}
    </div>
  </li>
)

const SupportList = ({
  title,
  items,
  getName,
}: {
  readonly title: string
  readonly items: readonly OracleSupport[]
  readonly getName: (id: number) => string
}) =>
  items.length === 0 ? null : (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">{title}</span>
      {items.map((item) => (
        <StatusBadge key={item.id} status={item.isSupported ? 'pass' : 'fail'}>
          {`${getName(item.id)}${item.isSupported ? '' : ' unsupported'}`}
        </StatusBadge>
      ))}
    </div>
  )

const OracleResults = ({
  check,
  incompleteAt,
}: {
  readonly check: DnssecOracleCheck
  readonly incompleteAt: string | null
}) => (
  <div className="flex flex-col gap-4">
    <ul className="flex flex-col gap-2">
      {withUnreached(check.steps).map((result) => (
        <OutcomeRow key={result.label} {...result} />
      ))}
      {incompleteAt && (
        <li className="flex items-start gap-2">
          <StatusIcon status="fail" className="mt-0.5" />
          <div className="flex flex-col">
            <span className="font-mono text-sm">{incompleteAt}</span>
            <span className="text-sm text-muted-foreground">
              Nothing signed to submit — the proof stops here.
            </span>
          </div>
        </li>
      )}
      {check.records.map((result) => (
        <OutcomeRow key={result.label} {...result} isUnreached={false} />
      ))}
    </ul>
    <SupportList
      title="Signing algorithms"
      items={check.algorithms}
      getName={getAlgorithmName}
    />
    <SupportList
      title="DS digests"
      items={check.digests}
      getName={getDigestName}
    />
  </div>
)

type DnssecOracleSectionProps = {
  readonly request: OracleRequest
  readonly check: DnssecOracleCheck | undefined
  readonly isLoading: boolean
  readonly errorMessage: string | null
}

export const DnssecOracleSection = ({
  request,
  check,
  isLoading,
  errorMessage,
}: DnssecOracleSectionProps) => (
  <section className="flex flex-col gap-4">
    <div className="flex flex-col gap-1">
      <h2 className="text-caps leading-none">ENS DNSSEC oracle</h2>
      <p className="text-p text-muted-foreground">
        The same proof an import submits, replayed against the onchain oracle
        one link at a time. Read-only — nothing is sent.
      </p>
    </div>
    {isLoading && <LoadingSpinner title="Asking the oracle…" />}
    {errorMessage !== null && (
      <ErrorMessage
        compact
        description={`Could not reach the oracle: ${errorMessage}`}
      />
    )}
    {check && (
      <OracleResults check={check} incompleteAt={request.incompleteAt} />
    )}
  </section>
)
