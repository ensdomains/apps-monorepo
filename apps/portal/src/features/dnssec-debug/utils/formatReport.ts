import { DNS_RESOLVERS } from '../constants'
import type { CheckStatus, DnssecReport, DnssecStep } from '../types'
import type { OracleOutcome } from './oracle'
import { formatUtc } from './time'
import {
  type DnssecVerdict,
  describeVerdict,
  getStepLabel,
  type OracleCheckResult,
} from './verdict'

const STATUS_TAG: Readonly<Record<CheckStatus, string>> = {
  pass: '[ OK ]',
  warn: '[WARN]',
  fail: '[FAIL]',
  skip: '[ -- ]',
}

const OUTCOME_TAG: Readonly<Record<OracleOutcome['status'], string>> = {
  pass: STATUS_TAG.pass,
  fail: STATUS_TAG.fail,
  error: '[ ?? ]',
}

const formatStep = (step: DnssecStep): string[] => [
  `${STATUS_TAG[step.status]} ${getStepLabel(step)}`,
  ...step.checks.map(
    (check) =>
      `    ${STATUS_TAG[check.status]} ${check.title}${check.detail ? ` — ${check.detail.replace(/\n/g, '; ')}` : ''}`,
  ),
]

const formatOracle = (oracle: OracleCheckResult | undefined): string[] =>
  oracle
    ? [
        'ENS DNSSEC oracle',
        ...[...oracle.steps, ...oracle.records].map(
          ({ label, outcome }) =>
            `    ${OUTCOME_TAG[outcome.status]} ${label}${outcome.status === 'pass' ? '' : ` — ${outcome.message}`}`,
        ),
      ]
    : ['ENS DNSSEC oracle: not checked']

/** Plain-text report to paste into a support ticket. */
export const formatReport = ({
  report,
  verdict,
  oracle,
}: {
  readonly report: DnssecReport
  readonly verdict: DnssecVerdict
  readonly oracle: OracleCheckResult | undefined
}): string => {
  const { title, description } = describeVerdict(verdict, report.name)
  return [
    `DNSSEC report for ${report.name}`,
    `Checked ${formatUtc(report.checkedAt)} via ${DNS_RESOLVERS[report.resolver].label}`,
    '',
    title,
    description,
    '',
    ...[...report.zones, ...report.records].flatMap(formatStep),
    '',
    ...formatOracle(oracle),
  ].join('\n')
}
