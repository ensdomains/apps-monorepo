import type { DnsResponse } from '@ensdomains/dnsprovejs'
import { concatBytes, hexToBytes } from 'viem'
import {
  DNSSEC_ALGORITHMS,
  DS_DIGEST_TYPES,
  getAlgorithmName,
  getDigestName,
} from '../constants'
import type {
  CheckStatus,
  DnskeyAnswer,
  DnssecCheck,
  DsInfo,
  ZoneStep,
} from '../types'
import { verifyDsDigest } from './crypto'
import {
  getRecords,
  getResponseCode,
  getSignatures,
  isAnswered,
  toDnskeyInfo,
  toDsInfo,
} from './dnsResponse'
import { evaluateSignatures, toSignatureCheck } from './signatures'
import {
  computeKeyTag,
  encodeDnskeyRdata,
  encodeDnsName,
  isSecureEntryPoint,
} from './wire'

const STATUS_SEVERITY: Readonly<Record<CheckStatus, number>> = {
  skip: 0,
  pass: 1,
  warn: 2,
  fail: 3,
}

/** A step is as bad as its worst check; all-skipped stays `skip`. */
export const getWorstStatus = (checks: readonly DnssecCheck[]): CheckStatus =>
  checks.reduce<CheckStatus>(
    (worst, check) =>
      STATUS_SEVERITY[check.status] > STATUS_SEVERITY[worst]
        ? check.status
        : worst,
    'skip',
  )

const formatZone = (zone: string): string =>
  zone === '.' ? 'the root zone' : `${zone}.`

type DsMatch = {
  readonly ds: DsInfo
  readonly key: DnskeyAnswer
  readonly verdict: 'valid' | 'invalid' | 'unsupported'
}

const matchDsToKeys = async (
  zone: string,
  dsRecords: readonly DsInfo[],
  keys: readonly DnskeyAnswer[],
): Promise<readonly DsMatch[]> => {
  const pairs = dsRecords.flatMap((ds) =>
    keys
      .filter(
        (key) =>
          key.data.algorithm === ds.algorithm &&
          computeKeyTag(key) === ds.keyTag,
      )
      .map((key) => ({ ds, key })),
  )
  return Promise.all(
    pairs.map(async ({ ds, key }) => ({
      ds,
      key,
      verdict: await verifyDsDigest({
        digestType: ds.digestType,
        data: concatBytes([encodeDnsName(zone), encodeDnskeyRdata(key)]),
        digest: hexToBytes(ds.digest),
      }),
    })),
  )
}

const tagList = (tags: readonly number[]): string =>
  tags.length === 0 ? 'none' : [...new Set(tags)].join(', ')

const toDsMatchCheck = (
  matches: readonly DsMatch[],
  dsRecords: readonly DsInfo[],
  keys: readonly DnskeyAnswer[],
): DnssecCheck => {
  const valid = matches.find((match) => match.verdict === 'valid')
  if (valid) {
    return {
      id: 'ds-match',
      status: 'pass',
      title: `DS matches key ${valid.ds.keyTag}`,
      detail: `The ${getDigestName(valid.ds.digestType)} digest of DNSKEY ${valid.ds.keyTag} (${getAlgorithmName(valid.key.data.algorithm)}) matches the DS record.`,
    }
  }
  if (matches.some((match) => match.verdict === 'unsupported')) {
    return {
      id: 'ds-match',
      status: 'warn',
      title: "DS digest can't be checked here",
      detail: 'The DS records use a digest type this browser cannot compute.',
    }
  }
  return {
    id: 'ds-match',
    status: 'fail',
    title: 'No DS record matches a DNSKEY',
    detail: `DS key tags: ${tagList(dsRecords.map((ds) => ds.keyTag))}. DNSKEY key tags: ${tagList(keys.map(computeKeyTag))}. This usually follows a key rollover where the registrar still holds the old DS record.`,
  }
}

const toAlgorithmsCheck = (
  dsRecords: readonly DsInfo[],
  keys: readonly DnskeyAnswer[],
): DnssecCheck => {
  const algorithms = [...new Set(keys.map((key) => key.data.algorithm))]
  const digests = [...new Set(dsRecords.map((ds) => ds.digestType))]
  const discouraged = [
    ...algorithms
      .filter((a) => {
        const level = DNSSEC_ALGORITHMS[a]?.recommendation
        return level === 'NOT RECOMMENDED' || level === 'MUST NOT'
      })
      .map(getAlgorithmName),
    ...digests
      .filter((d) => DS_DIGEST_TYPES[d]?.recommendation === 'MUST NOT')
      .map(getDigestName),
  ]
  const summary = [
    ...algorithms.map(getAlgorithmName),
    ...digests.map(getDigestName),
  ].join(' · ')
  return discouraged.length > 0
    ? {
        id: 'algorithms',
        status: 'warn',
        title: 'Outdated algorithms in use',
        detail: `${discouraged.join(', ')} ${discouraged.length === 1 ? 'is' : 'are'} discouraged by RFC 8624. Consider moving to ECDSAP256SHA256 or RSASHA256 with SHA-256 DS records.`,
      }
    : { id: 'algorithms', status: 'pass', title: 'Algorithms', detail: summary }
}

const toDsRecordsCheck = ({
  zone,
  parent,
  dsResponse,
  dsRecords,
  hasKeys,
}: {
  readonly zone: string
  readonly parent: string | null
  readonly dsResponse: DnsResponse | null
  readonly dsRecords: readonly DsInfo[]
  readonly hasKeys: boolean
}): DnssecCheck => {
  if (parent === null) {
    return {
      id: 'ds-records',
      status: 'pass',
      title: 'Root trust anchors',
      detail: `Trusted through the IANA root key anchors (key tags ${tagList(dsRecords.map((ds) => ds.keyTag))}).`,
    }
  }
  if (!isAnswered(dsResponse)) {
    return {
      id: 'ds-records',
      status: 'fail',
      title: 'DS lookup failed',
      detail: `The resolver answered ${getResponseCode(dsResponse)} when asked for the DS records of ${zone}.`,
    }
  }
  if (dsRecords.length === 0) {
    return {
      id: 'ds-records',
      status: 'fail',
      title: `No DS record in ${formatZone(parent)}`,
      detail: hasKeys
        ? `${zone} is signed, but ${formatZone(parent)} publishes no DS record for it, so nothing links the two. Add the DS record at your registrar.`
        : `DNSSEC is not enabled for ${zone}: there is no DS record at its parent and no DNSKEY in the zone. Enable DNSSEC with your DNS provider, then add the DS record at your registrar.`,
    }
  }
  return {
    id: 'ds-records',
    status: 'pass',
    title: `${dsRecords.length} DS ${dsRecords.length === 1 ? 'record' : 'records'} in ${formatZone(parent)}`,
    detail: `Key tags ${tagList(dsRecords.map((ds) => ds.keyTag))}.`,
  }
}

const toDnskeyRecordsCheck = (
  zone: string,
  dnskeyResponse: DnsResponse,
  keys: readonly DnskeyAnswer[],
): DnssecCheck => {
  if (!isAnswered(dnskeyResponse)) {
    return {
      id: 'dnskey-records',
      status: 'fail',
      title: 'DNSKEY lookup failed',
      detail: `The resolver answered ${getResponseCode(dnskeyResponse)} when asked for the DNSKEY records of ${zone}.`,
    }
  }
  if (keys.length === 0) {
    return {
      id: 'dnskey-records',
      status: 'fail',
      title: 'No DNSKEY records',
      detail: `${zone} publishes no signing keys — the zone is not signed.`,
    }
  }
  const kskCount = keys.filter(isSecureEntryPoint).length
  return {
    id: 'dnskey-records',
    status: 'pass',
    title: `${keys.length} DNSKEY ${keys.length === 1 ? 'record' : 'records'}`,
    detail: `${kskCount} key-signing, ${keys.length - kskCount} zone-signing.`,
  }
}

export type ZoneEvaluation = {
  readonly step: ZoneStep
  /** The zone's DNSKEYs, for verifying signatures made by this zone. */
  readonly keys: readonly DnskeyAnswer[]
}

/**
 * Validates one link of the chain: the DS records the parent publishes for
 * the zone (signed by the parent's keys), and the zone's DNSKEY set (anchored
 * by one of those DS records and signed by the key it anchors).
 */
export const evaluateZone = async ({
  zone,
  parent,
  dsResponse,
  dnskeyResponse,
  parentKeys,
  anchors,
  now,
}: {
  readonly zone: string
  readonly parent: string | null
  readonly dsResponse: DnsResponse | null
  readonly dnskeyResponse: DnsResponse
  readonly parentKeys: readonly DnskeyAnswer[]
  readonly anchors: readonly DsInfo[]
  readonly now: number
}): Promise<ZoneEvaluation> => {
  const dsAnswers = getRecords(dsResponse, 'DS', zone)
  const dsRecords = parent === null ? anchors : dsAnswers.map(toDsInfo)
  const keys = getRecords(dnskeyResponse, 'DNSKEY', zone)

  const [dsSignatures, matches] = await Promise.all([
    evaluateSignatures({
      records: dsAnswers,
      signatures: getSignatures(dsResponse, zone, 'DS'),
      keys: parentKeys,
      now,
    }),
    matchDsToKeys(zone, dsRecords, keys),
  ])
  const anchoredKeys = [
    ...new Set(
      matches
        .filter((match) => match.verdict !== 'invalid')
        .map((match) => match.key),
    ),
  ]
  const dnskeySignatures = await evaluateSignatures({
    records: keys,
    signatures: getSignatures(dnskeyResponse, zone, 'DNSKEY'),
    keys: anchoredKeys.length > 0 ? anchoredKeys : keys,
    now,
  })

  const hasDs = dsRecords.length > 0
  const hasKeys = keys.length > 0
  const checks: DnssecCheck[] = [
    toDsRecordsCheck({ zone, parent, dsResponse, dsRecords, hasKeys }),
    ...(parent !== null && hasDs
      ? [
          toSignatureCheck({
            id: 'ds-signature',
            subject: 'DS records',
            result: dsSignatures,
            now,
          }),
        ]
      : []),
    toDnskeyRecordsCheck(zone, dnskeyResponse, keys),
    ...(hasDs && hasKeys ? [toDsMatchCheck(matches, dsRecords, keys)] : []),
    ...(hasKeys
      ? [
          anchoredKeys.length > 0
            ? toSignatureCheck({
                id: 'dnskey-signature',
                subject: 'DNSKEY records',
                result: dnskeySignatures,
                now,
              })
            : {
                id: 'dnskey-signature' as const,
                status: 'skip' as const,
                title: 'DNSKEY signature not checked',
                detail:
                  'No key in the zone is anchored by a DS record, so its signature cannot establish trust.',
              },
          toAlgorithmsCheck(dsRecords, keys),
        ]
      : []),
  ]

  return {
    keys,
    step: {
      kind: 'zone',
      zone,
      parent,
      status: getWorstStatus(checks),
      checks,
      ds: dsRecords,
      dnskeys: keys.map(toDnskeyInfo),
      dsSignatures: dsSignatures.evaluations,
      dnskeySignatures: dnskeySignatures.evaluations,
      proofs: {
        ds: parent === null ? null : dsSignatures.proof,
        dnskey: dnskeySignatures.proof,
      },
    },
  }
}
