import type { DnsResponse, RecordAnswer } from '@ensdomains/dnsprovejs'
import { bytesToHex } from 'viem'
import type {
  DnskeyAnswer,
  DnskeyInfo,
  DsAnswer,
  DsInfo,
  RrsigAnswer,
} from '../types'
import {
  computeKeyTag,
  isSameDnsName,
  isSecureEntryPoint,
  normalizeDnsName,
  toBase64,
} from './wire'

type AnyAnswer = NonNullable<DnsResponse['answers']>[number]
type RecordType = RecordAnswer['type']
type RecordOf<T extends RecordType> = Extract<RecordAnswer, { type: T }>

const isRecordOf =
  <T extends RecordType>(type: T) =>
  (answer: AnyAnswer): answer is RecordOf<T> =>
    answer.type === type

/** Records of one type at one owner name in the answer section. */
export const getRecords = <T extends RecordType>(
  response: DnsResponse | null,
  type: T,
  owner: string,
): RecordOf<T>[] =>
  (response?.answers ?? [])
    .filter(isRecordOf(type))
    .filter((record) => isSameDnsName(record.name, owner))

/** RRSIGs at `owner` covering `typeCovered`. */
export const getSignatures = (
  response: DnsResponse | null,
  owner: string,
  typeCovered: RecordType,
): RrsigAnswer[] =>
  getRecords(response, 'RRSIG', owner).filter(
    (sig) => sig.data.typeCovered === typeCovered,
  )

/**
 * The zone a response was answered from: the signer of the first RRSIG over
 * an answer, else the SOA a negative answer carries in its authority section.
 */
export const getAnsweringZone = (
  response: DnsResponse | null,
): string | null => {
  const sig = (response?.answers ?? []).find(isRecordOf('RRSIG'))
  if (sig) return normalizeDnsName(sig.data.signersName)
  const soa = [
    ...(response?.answers ?? []),
    ...(response?.authorities ?? []),
  ].find(isRecordOf('SOA'))
  return soa ? normalizeDnsName(soa.name) : null
}

export const getResponseCode = (response: DnsResponse | null): string =>
  response?.rcode ?? 'NOERROR'

/** NOERROR and NXDOMAIN are real answers; anything else is a failed lookup. */
export const isAnswered = (response: DnsResponse | null): boolean => {
  const rcode = getResponseCode(response)
  return rcode === 'NOERROR' || rcode === 'NXDOMAIN'
}

const AUTHENTIC_DATA_FLAG = 1 << 5

export const isAuthenticated = (response: DnsResponse | null): boolean =>
  ((response?.flags ?? 0) & AUTHENTIC_DATA_FLAG) !== 0

export const toDsInfo = (record: DsAnswer): DsInfo => ({
  keyTag: record.data.keyTag,
  algorithm: record.data.algorithm,
  digestType: record.data.digestType,
  digest: bytesToHex(record.data.digest),
})

export const toDnskeyInfo = (key: DnskeyAnswer): DnskeyInfo => ({
  flags: key.data.flags,
  algorithm: key.data.algorithm,
  keyTag: computeKeyTag(key),
  isKsk: isSecureEntryPoint(key),
  publicKey: toBase64(key.data.key),
})
