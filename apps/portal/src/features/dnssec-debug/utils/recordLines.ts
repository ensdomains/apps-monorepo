import { getAlgorithmName, getDigestName } from '../constants'
import type {
  DnssecStep,
  SignatureCrypto,
  SignatureEvaluation,
  SignatureTiming,
} from '../types'
import { formatUtc } from './time'

const CRYPTO_LABEL: Readonly<Record<SignatureCrypto, string>> = {
  valid: 'verifies',
  invalid: 'does not verify',
  'no-key': 'signing key missing',
  unsupported: 'algorithm not checkable here',
}

const TIMING_LABEL: Readonly<Record<SignatureTiming, string>> = {
  current: '',
  expired: ', expired',
  'not-yet-valid': ', not valid yet',
}

const truncateMiddle = (value: string, keep = 24): string =>
  value.length <= keep * 2
    ? value
    : `${value.slice(0, keep)}…${value.slice(-keep)}`

const signatureLine = (covered: string, sig: SignatureEvaluation): string =>
  `RRSIG ${covered} by ${sig.signer} key ${sig.keyTag} (${getAlgorithmName(sig.algorithm)}) ${formatUtc(sig.inception)} → ${formatUtc(sig.expiration)}: ${CRYPTO_LABEL[sig.crypto]}${TIMING_LABEL[sig.timing]}`

/** Human-readable record listing for a step's "records" disclosure. */
export const getRecordLines = (step: DnssecStep): readonly string[] => {
  if (step.kind === 'record') {
    return [
      ...step.values.map((value) => `TXT "${value}"`),
      ...step.signatures.map((sig) => signatureLine('TXT', sig)),
    ]
  }
  return [
    ...step.ds.map(
      (ds) =>
        `DS${step.parent === null ? ' (trust anchor)' : ''} key ${ds.keyTag} ${getAlgorithmName(ds.algorithm)} ${getDigestName(ds.digestType)} ${truncateMiddle(ds.digest.slice(2))}`,
    ),
    ...step.dsSignatures.map((sig) => signatureLine('DS', sig)),
    ...step.dnskeys.map(
      (key) =>
        `DNSKEY key ${key.keyTag} ${key.isKsk ? 'KSK' : 'ZSK'} flags ${key.flags} ${getAlgorithmName(key.algorithm)} ${truncateMiddle(key.publicKey)}`,
    ),
    ...step.dnskeySignatures.map((sig) => signatureLine('DNSKEY', sig)),
  ]
}
