import type {
  DnssecCheck,
  DnssecReport,
  DnssecStep,
  RecordPurpose,
} from '../types'
import type { OracleOutcome } from './oracle'
import { isProperAncestor } from './wire'

export type OracleStepResult = {
  readonly label: string
  readonly outcome: OracleOutcome
}

export type OracleCheckResult = {
  readonly steps: readonly OracleStepResult[]
  readonly records: readonly OracleStepResult[]
}

/** Why the oracle's verdict on links still in play is unknown. */
type OracleUnavailable = {
  /** The link the oracle couldn't evaluate, or null when it wasn't reached at all. */
  readonly step: string | null
  readonly message: string
}

export type DnssecVerdict =
  | { readonly kind: 'valid'; readonly warnings: number }
  | { readonly kind: 'no-records'; readonly warnings: number }
  | { readonly kind: 'name-not-found' }
  | { readonly kind: 'not-enabled'; readonly zone: string }
  | {
      readonly kind: 'broken'
      /** The import the break is confined to, or null when both depend on it. */
      readonly path: RecordPurpose | null
      readonly step: string
      readonly check: DnssecCheck
    }
  | {
      /** One import breaks while the other's record validates. */
      readonly kind: 'path-broken'
      readonly path: RecordPurpose
      readonly step: string
      readonly check: DnssecCheck
      /** Set when the other import validates in DNS but not, yet, in the oracle. */
      readonly oracleUnavailable: OracleUnavailable | null
      readonly warnings: number
    }
  | {
      readonly kind: 'oracle-rejected'
      readonly step: string
      readonly message: string
    }
  | ({
      /** DNS validates, but the oracle's verdict is unknown — not an acceptance. */
      readonly kind: 'oracle-unavailable'
      readonly warnings: number
    } & OracleUnavailable)

export const getStepLabel = (step: DnssecStep): string => {
  if (step.kind === 'record') return `${step.owner} TXT`
  return step.zone === '.' ? '. (root)' : `${step.zone}.`
}

const isNotEnabled = (step: DnssecStep): boolean =>
  step.kind === 'zone' && step.ds.length === 0 && step.dnskeys.length === 0

const PATHS: readonly RecordPurpose[] = ['onchain', 'offchain']

const getZonePath = (
  report: DnssecReport,
  zone: string,
): RecordPurpose | null =>
  isProperAncestor(report.apexZone, zone) ? 'onchain' : null

/**
 * The import a step serves, or null for a link both depend on. A zone below
 * the apex is `_ens.<name>`'s own, which only the onchain import reads.
 */
export const getStepPath = (
  report: DnssecReport,
  step: DnssecStep,
): RecordPurpose | null =>
  step.kind === 'record' ? step.purpose : getZonePath(report, step.zone)

/** Oracle results are labelled `<zone>. DS|DNSKEY` or `<owner> TXT`. */
const getOracleLabelPath = (
  report: DnssecReport,
  label: string,
): RecordPurpose | null =>
  report.records.find((record) => getStepLabel(record) === label)?.purpose ??
  getZonePath(report, label.replace(/ (DS|DNSKEY)$/, ''))

const findOracleOutcome = (
  oracle: OracleCheckResult | undefined,
  status: 'fail' | 'error',
  isRelevant: (label: string) => boolean = () => true,
): OracleStepResult | undefined =>
  [...(oracle?.steps ?? []), ...(oracle?.records ?? [])].find(
    (result) => result.outcome.status === status && isRelevant(result.label),
  )

const toBreak = (step: DnssecStep | undefined) => {
  const check = step?.checks.find((c) => c.status === 'fail')
  return step && check ? { step: getStepLabel(step), check } : null
}

/** What the oracle check came back with: its result, or why there is none. */
export type OracleState =
  | { readonly status: 'checked'; readonly result: OracleCheckResult }
  | { readonly status: 'unavailable'; readonly message: string }
  | { readonly status: 'not-checked' }

/** Why the oracle has no verdict on the links `isLive` keeps, if it hasn't. */
const getOracleUnavailable = (
  oracleState: OracleState,
  isLive: (label: string) => boolean,
): OracleUnavailable | null => {
  if (oracleState.status === 'unavailable') {
    return { step: null, message: oracleState.message }
  }
  const oracle =
    oracleState.status === 'checked' ? oracleState.result : undefined
  const error = findOracleOutcome(oracle, 'error', isLive)
  return error && error.outcome.status === 'error'
    ? { step: error.label, message: error.outcome.message }
    : null
}

/**
 * The headline answer: the first link that fails, in chain order — later
 * links can't be trusted once an earlier one breaks, so that's the one to fix.
 * A break confined to one import doesn't hide the other when its record
 * validates. Once DNS validates, an oracle that couldn't answer leaves the
 * verdict unknown rather than valid.
 */
export const deriveVerdict = (
  report: DnssecReport,
  oracleState: OracleState = { status: 'not-checked' },
): DnssecVerdict => {
  const oracle =
    oracleState.status === 'checked' ? oracleState.result : undefined
  if (!report.nameExists) return { kind: 'name-not-found' }

  const steps: readonly DnssecStep[] = [...report.zones, ...report.records]
  const failing = steps.filter((step) => step.status === 'fail')

  const shared = failing.find((step) => getStepPath(report, step) === null)
  if (shared?.kind === 'zone' && isNotEnabled(shared)) {
    return { kind: 'not-enabled', zone: shared.zone }
  }
  const sharedBreak = toBreak(shared)
  if (sharedBreak) return { kind: 'broken', path: null, ...sharedBreak }

  // In chain order: `_ens`'s own zones and record come before the apex record.
  const pathBreaks = PATHS.flatMap((path) => {
    const pathBreak = toBreak(
      failing.find((step) => getStepPath(report, step) === path),
    )
    return pathBreak ? [{ path, ...pathBreak }] : []
  })
  const brokenPaths = pathBreaks.map(({ path }) => path)
  const hasWorkingPath = report.records.some(
    (record) =>
      !brokenPaths.includes(record.purpose) &&
      (record.status === 'pass' || record.status === 'warn'),
  )
  const [firstBreak] = pathBreaks
  if (firstBreak && !hasWorkingPath) return { kind: 'broken', ...firstBreak }

  // What the oracle says about a path already reported broken changes nothing.
  const isLive = (label: string) => {
    const path = getOracleLabelPath(report, label)
    return path === null || !brokenPaths.includes(path)
  }
  const oracleFailure = findOracleOutcome(oracle, 'fail', isLive)
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

  const oracleUnavailable = getOracleUnavailable(oracleState, isLive)

  if (firstBreak) {
    return { kind: 'path-broken', ...firstBreak, oracleUnavailable, warnings }
  }
  if (oracleUnavailable) {
    return { kind: 'oracle-unavailable', ...oracleUnavailable, warnings }
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

const PATH_LABEL: Readonly<Record<RecordPurpose, string>> = {
  onchain: 'onchain import',
  offchain: 'gasless import',
}

/** Keyed by the broken import: the record and use the other one leaves. */
const OTHER_PATH: Readonly<
  Record<RecordPurpose, { readonly record: string; readonly use: string }>
> = {
  onchain: { record: '"ENS1"', use: 'be used gaslessly' },
  offchain: { record: '"_ens"', use: 'be imported onchain' },
}

const describeBreak = (check: DnssecCheck): string =>
  `${check.title.replace(/\.$/, '')}. ${check.detail ?? ''}`.trim()

const describeOracleUnavailable = ({ step, message }: OracleUnavailable) =>
  `the onchain DNSSEC oracle ${step ? `could not evaluate ${step}` : 'could not be reached'}: ${message.replace(/\.$/, '')}`

const describeOtherPath = (
  path: RecordPurpose,
  oracleUnavailable: OracleUnavailable | null,
): string => {
  const { record, use } = OTHER_PATH[path]
  return oracleUnavailable
    ? `The ${record} record validates in DNS, but ${describeOracleUnavailable(oracleUnavailable)}. Whether the name can still ${use} is unknown.`
    : `The ${record} record validates, so the name can still ${use}.`
}

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
        description: verdict.path
          ? `${describeBreak(verdict.check)} Only the ${PATH_LABEL[verdict.path]} depends on this link.`
          : describeBreak(verdict.check),
      }
    case 'path-broken':
      return {
        title: `The ${PATH_LABEL[verdict.path]} breaks at ${verdict.step}`,
        description: `${describeBreak(verdict.check)} ${describeOtherPath(verdict.path, verdict.oracleUnavailable)}${warningSuffix(verdict.warnings)}`,
      }
    case 'oracle-rejected':
      return {
        title: 'The ENS oracle rejects the proof',
        description: `DNS validates, but the onchain DNSSEC oracle rejects ${verdict.step}: ${verdict.message}`,
      }
    case 'oracle-unavailable':
      return {
        title: 'DNS validates, but the ENS oracle could not be checked',
        description: `Every DNS link validates, but ${describeOracleUnavailable(verdict)}. Whether it accepts the proof is unknown.${warningSuffix(verdict.warnings)}`,
      }
  }
}
