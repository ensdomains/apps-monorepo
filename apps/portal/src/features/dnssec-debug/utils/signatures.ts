import { type RecordAnswer, SignedSet } from '@ensdomains/dnsprovejs'
import { bytesToHex } from 'viem'
import {
  getAlgorithmName,
  SIGNATURE_EXPIRY_WARNING_SECONDS,
} from '../constants'
import type {
  DnskeyAnswer,
  DnssecCheck,
  DnssecCheckId,
  ProofSet,
  RrsigAnswer,
  SignatureCrypto,
  SignatureEvaluation,
  SignatureTiming,
} from '../types'
import { type CryptoVerdict, verifyDnssecSignature } from './crypto'
import { formatRelativeTime, formatUtc, serialGte } from './time'
import {
  computeKeyTag,
  countLabels,
  isSameDnsName,
  isZoneKey,
  normalizeDnsName,
} from './wire'

export type SignatureResult = {
  readonly evaluations: readonly SignatureEvaluation[]
  readonly best: SignatureEvaluation | null
  /** The signature to put in an oracle proof — the best one, if any. */
  readonly proof: ProofSet | null
}

const getTiming = (sig: RrsigAnswer, now: number): SignatureTiming => {
  if (!serialGte(sig.data.expiration, now)) return 'expired'
  if (!serialGte(now, sig.data.inception)) return 'not-yet-valid'
  return 'current'
}

/** Owner as signed: a wildcard expansion is signed over `*.<closest encloser>`. */
const getSignedOwner = (owner: string, labels: number): string => {
  const normalized = normalizeDnsName(owner)
  if (labels >= countLabels(normalized)) return normalized
  const suffix = normalized.split('.').slice(-labels).join('.')
  return labels === 0 ? '*' : `*.${suffix}`
}

const canonicalSignature = (sig: RrsigAnswer): RrsigAnswer => ({
  ...sig,
  data: { ...sig.data, signersName: normalizeDnsName(sig.data.signersName) },
})

// SignedSet.toWire sorts and rewrites the records it is given (canonical
// order, lowercased owner, original TTL), so always hand it copies.
const encodeSignedSet = (
  records: readonly RecordAnswer[],
  sig: RrsigAnswer,
  owner?: string,
): Uint8Array =>
  new SignedSet(
    records.map((record) => ({ ...record, name: owner ?? record.name })),
    canonicalSignature(sig),
  ).toWire(true)

const combineVerdicts = (
  verdicts: readonly CryptoVerdict[],
): SignatureCrypto => {
  if (verdicts.includes('valid')) return 'valid'
  if (verdicts.length > 0 && verdicts.every((v) => v === 'unsupported')) {
    return 'unsupported'
  }
  return 'invalid'
}

const evaluateSignature = async ({
  records,
  sig,
  keys,
  now,
}: {
  readonly records: readonly RecordAnswer[]
  readonly sig: RrsigAnswer
  readonly keys: readonly DnskeyAnswer[]
  readonly now: number
}): Promise<SignatureEvaluation> => {
  const candidates = keys.filter(
    (key) =>
      isZoneKey(key) &&
      key.data.algorithm === sig.data.algorithm &&
      computeKeyTag(key) === sig.data.keyTag &&
      isSameDnsName(key.name, sig.data.signersName),
  )
  const signedData = encodeSignedSet(
    records,
    sig,
    getSignedOwner(records[0].name, sig.data.labels),
  )
  const verdicts = await Promise.all(
    candidates.map((key) =>
      verifyDnssecSignature({
        algorithm: sig.data.algorithm,
        publicKey: key.data.key,
        data: signedData,
        signature: sig.data.signature,
      }),
    ),
  )
  return {
    keyTag: sig.data.keyTag,
    algorithm: sig.data.algorithm,
    signer: normalizeDnsName(sig.data.signersName),
    labels: sig.data.labels,
    inception: sig.data.inception,
    expiration: sig.data.expiration,
    crypto: candidates.length === 0 ? 'no-key' : combineVerdicts(verdicts),
    timing: getTiming(sig, now),
  }
}

const CRYPTO_RANK: Readonly<Record<SignatureCrypto, number>> = {
  valid: 0,
  unsupported: 1,
  invalid: 2,
  'no-key': 3,
}

/**
 * Lower is better. Among signatures that verify or can't be checked here, a
 * current validity window wins over the algorithm: during a rollover an expired
 * signature that verifies proves nothing, while a current one this browser
 * can't verify leaves the link inconclusive rather than broken.
 */
const rank = ({ crypto, timing }: SignatureEvaluation): number => {
  const timingRank = timing === 'current' ? 0 : 1
  return crypto === 'valid' || crypto === 'unsupported'
    ? timingRank * 2 + CRYPTO_RANK[crypto]
    : 4 + CRYPTO_RANK[crypto] * 2 + timingRank
}

/**
 * Checks every RRSIG over an RRset against the candidate keys. One good
 * signature is enough (RFC 4035 §5.3.3); the rest are kept for display.
 */
export const evaluateSignatures = async ({
  records,
  signatures,
  keys,
  now,
}: {
  readonly records: readonly RecordAnswer[]
  readonly signatures: readonly RrsigAnswer[]
  readonly keys: readonly DnskeyAnswer[]
  readonly now: number
}): Promise<SignatureResult> => {
  if (records.length === 0 || signatures.length === 0) {
    return { evaluations: [], best: null, proof: null }
  }
  const evaluations = await Promise.all(
    signatures.map((sig) => evaluateSignature({ records, sig, keys, now })),
  )
  const bestIndex = evaluations.reduce(
    (best, evaluation, index) =>
      rank(evaluation) < rank(evaluations[best]) ? index : best,
    0,
  )
  const sig = signatures[bestIndex]
  return {
    evaluations,
    best: evaluations[bestIndex],
    proof: {
      rrset: bytesToHex(encodeSignedSet(records, sig)),
      sig: bytesToHex(sig.data.signature),
    },
  }
}

const describeKey = (evaluation: SignatureEvaluation): string =>
  `key ${evaluation.keyTag} (${getAlgorithmName(evaluation.algorithm)})`

/** Turns the best signature over an RRset into a pass/warn/fail check. */
export const toSignatureCheck = ({
  id,
  subject,
  result,
  now,
}: {
  readonly id: DnssecCheckId
  readonly subject: string
  readonly result: SignatureResult
  readonly now: number
}): DnssecCheck => {
  const { best } = result
  if (!best) {
    return {
      id,
      status: 'fail',
      title: `${subject} are not signed`,
      detail: 'No RRSIG record covers them, so they cannot be validated.',
    }
  }
  const key = describeKey(best)
  if (best.crypto === 'no-key') {
    return {
      id,
      status: 'fail',
      title: 'Signing key not found',
      detail: `${subject} are signed by ${key} of ${best.signer}, but that zone publishes no matching DNSKEY.`,
    }
  }
  if (best.crypto === 'invalid') {
    return {
      id,
      status: 'fail',
      title: 'Signature does not verify',
      detail: `The RRSIG by ${key} does not match ${subject.toLowerCase()} — they changed after signing, or were signed with a different key.`,
    }
  }
  if (best.timing === 'expired') {
    return {
      id,
      status: 'fail',
      title: 'Signature expired',
      detail: `The RRSIG by ${key} expired ${formatRelativeTime(best.expiration, now)} (${formatUtc(best.expiration)}). The zone has to be re-signed — DNS providers normally do this automatically.`,
    }
  }
  if (best.timing === 'not-yet-valid') {
    return {
      id,
      status: 'fail',
      title: 'Signature not valid yet',
      detail: `The RRSIG by ${key} only becomes valid ${formatRelativeTime(best.inception, now)} (${formatUtc(best.inception)}).`,
    }
  }
  if (best.crypto === 'unsupported') {
    return {
      id,
      status: 'warn',
      title: `${getAlgorithmName(best.algorithm)} can't be checked here`,
      detail: `${subject} are signed by ${key}, but this browser cannot verify that algorithm.`,
    }
  }
  const isExpiringSoon =
    best.expiration - now < SIGNATURE_EXPIRY_WARNING_SECONDS
  return {
    id,
    status: isExpiringSoon ? 'warn' : 'pass',
    title: `${subject} signed by ${key}`,
    detail: `Valid until ${formatUtc(best.expiration)} (${formatRelativeTime(best.expiration, now)}).${isExpiringSoon ? ' Resolution breaks if the zone is not re-signed before then.' : ''}`,
  }
}
