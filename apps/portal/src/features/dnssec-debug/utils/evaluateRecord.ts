import type { DnsResponse } from '@ensdomains/dnsprovejs'
import { isAddress } from 'viem'
import { DNS_RESOLVERS, type DnsResolverId } from '../constants'
import type {
  DnskeyAnswer,
  DnssecCheck,
  RecordPurpose,
  RecordStep,
} from '../types'
import {
  getRecords,
  getResponseCode,
  getSignatures,
  isAnswered,
  isAuthenticated,
} from './dnsResponse'
import { getWorstStatus } from './evaluateZone'
import {
  evaluateSignatures,
  type SignatureResult,
  toSignatureCheck,
} from './signatures'
import { countLabels, decodeTxtData, normalizeDnsName } from './wire'

const ENS_PREFIX: Readonly<Record<RecordPurpose, string>> = {
  onchain: 'a=',
  offchain: 'ENS1 ',
}

const MISSING_HINT: Readonly<Record<RecordPurpose, string>> = {
  onchain:
    'Add a TXT record "a=<your address>" here to import the name onchain.',
  offchain:
    'Add a TXT record "ENS1 <resolver> <address>" here to use the name gaslessly.',
}

const toPresenceCheck = ({
  purpose,
  owner,
  response,
  values,
  ensValues,
  hasCname,
}: {
  readonly purpose: RecordPurpose
  readonly owner: string
  readonly response: DnsResponse
  readonly values: readonly string[]
  readonly ensValues: readonly string[]
  readonly hasCname: boolean
}): DnssecCheck => {
  if (!isAnswered(response)) {
    return {
      id: 'record-present',
      status: 'fail',
      title: 'TXT lookup failed',
      detail: `The resolver answered ${getResponseCode(response)} for ${owner}.`,
    }
  }
  if (hasCname) {
    return {
      id: 'record-present',
      status: 'fail',
      title: `${owner} is a CNAME`,
      detail: `DNSSEC proofs don't follow CNAMEs — the TXT record must live at ${owner} itself.`,
    }
  }
  if (ensValues.length > 0) {
    return {
      id: 'record-present',
      status: 'pass',
      title: 'Record found',
      detail: ensValues.join('\n'),
    }
  }
  if (purpose === 'onchain' && values.length > 0) {
    return {
      id: 'record-present',
      status: 'fail',
      title: 'Record is not in "a=0x…" format',
      detail: `Found: ${values.join(', ')}`,
    }
  }
  return {
    id: 'record-present',
    status: 'skip',
    title: values.length > 0 ? 'No ENS1 record' : 'No record',
    detail:
      values.length > 0
        ? `Only other TXT records were found. ${MISSING_HINT[purpose]}`
        : MISSING_HINT[purpose],
  }
}

const toFormatCheck = (purpose: RecordPurpose, value: string): DnssecCheck => {
  if (purpose === 'offchain') {
    const [, resolver] = value.split(/\s+/)
    return resolver
      ? {
          id: 'record-format',
          status: 'pass',
          title: 'ENS1 record',
          detail: `Resolver: ${resolver}`,
        }
      : {
          id: 'record-format',
          status: 'fail',
          title: 'ENS1 record has no resolver',
          detail: 'Expected "ENS1 <resolver> <address>".',
        }
  }
  const address = value.slice(ENS_PREFIX.onchain.length).trim()
  if (!isAddress(address, { strict: false })) {
    return {
      id: 'record-format',
      status: 'fail',
      title: 'Not an Ethereum address',
      detail: `"${address}" is not a 0x-prefixed, 40-character address.`,
    }
  }
  if (!isAddress(address, { strict: true })) {
    return {
      id: 'record-format',
      status: 'fail',
      title: 'Address checksum is invalid',
      detail:
        'Copy the address exactly, including capitalization, or write it all in lowercase.',
    }
  }
  return {
    id: 'record-format',
    status: 'pass',
    title: 'Valid address',
    detail: address,
  }
}

const toResolverCheck = (
  resolver: DnsResolverId,
  validated: DnsResponse,
): DnssecCheck => {
  const { label } = DNS_RESOLVERS[resolver]
  if (getResponseCode(validated) === 'SERVFAIL') {
    return {
      id: 'resolver-validation',
      status: 'fail',
      title: `${label} rejects the answer`,
      detail:
        'A validating resolver returns SERVFAIL for this record — this is what the import sees.',
    }
  }
  return isAuthenticated(validated)
    ? {
        id: 'resolver-validation',
        status: 'pass',
        title: `${label} validates the answer`,
        detail: 'The AD (authenticated data) flag is set.',
      }
    : {
        id: 'resolver-validation',
        status: 'warn',
        title: `${label} doesn't authenticate the answer`,
        detail:
          'The AD flag is not set, which the import treats as a DNSSEC failure.',
      }
}

const toWildcardCheck = (
  owner: string,
  signatures: SignatureResult,
): DnssecCheck | null => {
  const { best } = signatures
  if (!best || best.labels >= countLabels(owner)) return null
  return {
    id: 'record-wildcard',
    status: 'fail',
    title: 'Record comes from a wildcard',
    detail: `The record is synthesized from a wildcard, which the ENS oracle cannot verify. Add the TXT record at ${owner} explicitly.`,
  }
}

/**
 * Checks one of the TXT records ENS reads for a DNS name: presence and
 * format, its signature by the zone's keys, and whether a validating
 * resolver accepts it.
 */
export const evaluateRecord = async ({
  purpose,
  owner,
  response,
  validatedResponse,
  fallbackZone,
  zoneKeys,
  resolver,
  now,
}: {
  readonly purpose: RecordPurpose
  readonly owner: string
  /** Fetched with checking disabled — the raw records. */
  readonly response: DnsResponse
  /** Fetched with validation — the resolver's verdict. */
  readonly validatedResponse: DnsResponse
  readonly fallbackZone: string
  readonly zoneKeys: ReadonlyMap<string, readonly DnskeyAnswer[]>
  readonly resolver: DnsResolverId
  readonly now: number
}): Promise<RecordStep> => {
  const records = getRecords(response, 'TXT', owner)
  const signatures = getSignatures(response, owner, 'TXT')
  const values = records.map((record) => decodeTxtData(record.data))
  const ensValues = values.filter((value) =>
    value.startsWith(ENS_PREFIX[purpose]),
  )
  const zone = signatures[0]
    ? normalizeDnsName(signatures[0].data.signersName)
    : fallbackZone
  const keys = zoneKeys.get(zone)

  const signatureResult = await evaluateSignatures({
    records,
    signatures,
    keys: keys ?? [],
    now,
  })

  const presence = toPresenceCheck({
    purpose,
    owner,
    response,
    values,
    ensValues,
    hasCname: getRecords(response, 'CNAME', owner).length > 0,
  })
  const wildcard = toWildcardCheck(owner, signatureResult)
  const checks: DnssecCheck[] =
    ensValues.length === 0
      ? [presence]
      : [
          presence,
          ...ensValues.map((value) => toFormatCheck(purpose, value)),
          keys
            ? toSignatureCheck({
                id: 'record-signature',
                subject: 'TXT records',
                result: signatureResult,
                now,
              })
            : {
                id: 'record-signature',
                status: 'fail',
                title: `Signed by ${zone}, outside the checked chain`,
                detail: `The record's signer is not one of the zones validated above.`,
              },
          ...(wildcard ? [wildcard] : []),
          toResolverCheck(resolver, validatedResponse),
        ]

  return {
    kind: 'record',
    purpose,
    owner,
    zone: keys ? zone : null,
    status: getWorstStatus(checks),
    checks,
    values,
    signatures: signatureResult.evaluations,
    proof: signatureResult.proof,
  }
}
