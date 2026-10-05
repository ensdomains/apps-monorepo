import type { DnssecCheck, DnssecReport, DnssecStep } from '../types'
import type { OracleOutcome } from './oracle'

export type OracleStepResult = {
  readonly label: string
  readonly outcome: OracleOutcome
}

export type OracleCheckResult = {
  readonly steps: readonly OracleStepResult[]
  readonly records: readonly OracleStepResult[]
}

export type DnssecVerdict =
  | { readonly kind: 'valid'; readonly warnings: number }
  | { readonly kind: 'no-records'; readonly warnings: number }
  | { readonly kind: 'name-not-found' }
  | { readonly kind: 'not-enabled'; readonly zone: string }
  | {
      readonly kind: 'broken'
      readonly step: string
      readonly check: DnssecCheck
    }
  | {
      readonly kind: 'oracle-rejected'
      readonly step: string
      readonly message: string
    }
  | {
      /** DNS validates, but the oracle's verdict is unknown — not an acceptance. */
      readonly kind: 'oracle-unavailable'
      /** The link the oracle couldn't evaluate, or null when it wasn't reached at all. */
      readonly step: string | null
      readonly message: string
      readonly warnings: number
    }

export const getStepLabel = (step: DnssecStep): string => {
  if (step.kind === 'record') return `${step.owner} TXT`
  return step.zone === '.' ? '. (root)' : `${step.zone}.`
}

const isNotEnabled = (step: DnssecStep): boolean =>
  step.kind === 'zone' && step.ds.length === 0 && step.dnskeys.length === 0

const findOracleOutcome = (
  oracle: OracleCheckResult | undefined,
  status: 'fail' | 'error',
): OracleStepResult | undefined =>
  [...(oracle?.steps ?? []), ...(oracle?.records ?? [])].find(
    (result) => result.outcome.status === status,
  )

/** What the oracle check came back with: its result, or why there is none. */
export type OracleState =
  | { readonly status: 'checked'; readonly result: OracleCheckResult }
  | { readonly status: 'unavailable'; readonly message: string }
  | { readonly status: 'not-checked' }

/**
 * The headline answer: the first link that fails, in chain order — later
 * links can't be trusted once an earlier one breaks, so that's the one to fix.
 * Once DNS validates, an oracle that couldn't answer leaves the verdict
 * unknown rather than valid.
 */
export const deriveVerdict = (
  report: DnssecReport,
  oracleState: OracleState = { status: 'not-checked' },
): DnssecVerdict => {
  const oracle =
    oracleState.status === 'checked' ? oracleState.result : undefined
  if (!report.nameExists) return { kind: 'name-not-found' }

  const steps: readonly DnssecStep[] = [...report.zones, ...report.records]
  const broken = steps.find((step) => step.status === 'fail')
  if (broken) {
    if (isNotEnabled(broken) && broken.kind === 'zone') {
      return { kind: 'not-enabled', zone: broken.zone }
    }
    const check = broken.checks.find((c) => c.status === 'fail')
    if (check) return { kind: 'broken', step: getStepLabel(broken), check }
  }

  const oracleFailure = findOracleOutcome(oracle, 'fail')
  if (oracleFailure && oracleFailure.outcome.status === 'fail') {
    return {
      kind: 'oracle-rejected',
      step: oracleFailure.label,
      message: oracleFailure.outcome.message,
    }
  }

  const warnings = steps
    .flatMap((step) => step.checks)
    .filter((check) => check.status === 'warn').length

  if (oracleState.status === 'unavailable') {
    return {
      kind: 'oracle-unavailable',
      step: null,
      message: oracleState.message,
      warnings,
    }
  }
  const oracleError = findOracleOutcome(oracle, 'error')
  if (oracleError && oracleError.outcome.status === 'error') {
    return {
      kind: 'oracle-unavailable',
      step: oracleError.label,
      message: oracleError.outcome.message,
      warnings,
    }
  }
  const hasRecord = report.records.some(
    (record) => record.status === 'pass' || record.status === 'warn',
  )
  return hasRecord
    ? { kind: 'valid', warnings }
    : { kind: 'no-records', warnings }
}

const warningSuffix = (warnings: number): string =>
  warnings === 0
    ? ''
    : ` ${warnings} ${warnings === 1 ? 'warning needs' : 'warnings need'} attention.`

export const describeVerdict = (
  verdict: DnssecVerdict,
  name: string,
): { readonly title: string; readonly description: string } => {
  switch (verdict.kind) {
    case 'valid':
      return {
        title: 'Chain of trust is valid',
        description: `Every link from the root to ${name} validates, and ENS can read its records.${warningSuffix(verdict.warnings)}`,
      }
    case 'no-records':
      return {
        title: 'Chain is valid, but no ENS record is set',
        description: `DNSSEC works for ${name}, but neither an "_ens" nor an "ENS1" TXT record was found.${warningSuffix(verdict.warnings)}`,
      }
    case 'name-not-found':
      return {
        title: `${name} does not exist in DNS`,
        description:
          'The resolver answered NXDOMAIN. Check the spelling, or that the domain is registered.',
      }
    case 'not-enabled':
      return {
        title: `DNSSEC is not enabled for ${verdict.zone}`,
        description:
          verdict.zone === name
            ? 'The domain is not signed and has no DS record at its registrar. Enable DNSSEC with your DNS provider and registrar.'
            : `The .${verdict.zone} TLD does not support DNSSEC, so names under it cannot be used with ENS.`,
      }
    case 'broken':
      return {
        title: `Chain breaks at ${verdict.step}`,
        description:
          `${verdict.check.title.replace(/\.$/, '')}. ${verdict.check.detail ?? ''}`.trim(),
      }
    case 'oracle-rejected':
      return {
        title: 'The ENS oracle rejects the proof',
        description: `DNS validates, but the onchain DNSSEC oracle rejects ${verdict.step}: ${verdict.message}`,
      }
    case 'oracle-unavailable':
      return {
        title: 'DNS validates, but the ENS oracle could not be checked',
        description: `Every DNS link validates, but the onchain DNSSEC oracle ${verdict.step ? `could not evaluate ${verdict.step}` : 'could not be reached'}: ${verdict.message.replace(/\.$/, '')}. Whether it accepts the proof is unknown.${warningSuffix(verdict.warnings)}`,
      }
  }
}
