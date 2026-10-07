import type { DnsResponse, RecordAnswer } from '@ensdomains/dnsprovejs'
import type { Hex } from 'viem'
import type { DnsResolverId } from './constants'

export type DnskeyAnswer = Extract<RecordAnswer, { type: 'DNSKEY' }>
export type DsAnswer = Extract<RecordAnswer, { type: 'DS' }>
export type RrsigAnswer = Extract<RecordAnswer, { type: 'RRSIG' }>
export type TxtAnswer = Extract<RecordAnswer, { type: 'TXT' }>

export type DnsQueryType = 'DNSKEY' | 'DS' | 'TXT'

type DnsQueryParams = {
  readonly name: string
  readonly type: DnsQueryType
  /**
   * Sets the CD (checking disabled) bit so a validating resolver hands back
   * records even when their chain is broken — otherwise a bogus answer is
   * just SERVFAIL, with nothing to inspect.
   */
  readonly checkingDisabled: boolean
}

export type DnsQueryFn = (params: DnsQueryParams) => Promise<DnsResponse>

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip'

export type DnssecCheckId =
  | 'ds-records'
  | 'ds-signature'
  | 'dnskey-records'
  | 'ds-match'
  | 'dnskey-signature'
  | 'algorithms'
  | 'record-present'
  | 'record-format'
  | 'record-signature'
  | 'record-wildcard'
  | 'resolver-validation'

export type DnssecCheck = {
  readonly id: DnssecCheckId
  readonly status: CheckStatus
  readonly title: string
  readonly detail?: string
}

export type SignatureCrypto = 'valid' | 'invalid' | 'no-key' | 'unsupported'
export type SignatureTiming = 'current' | 'expired' | 'not-yet-valid'

export type SignatureEvaluation = {
  readonly keyTag: number
  readonly algorithm: number
  readonly signer: string
  readonly labels: number
  readonly inception: number
  readonly expiration: number
  readonly crypto: SignatureCrypto
  readonly timing: SignatureTiming
}

export type DnskeyInfo = {
  readonly flags: number
  readonly algorithm: number
  readonly keyTag: number
  /** Secure entry point flag — the key a parent DS normally points at. */
  readonly isKsk: boolean
  readonly publicKey: string
}

export type DsInfo = {
  readonly keyTag: number
  readonly algorithm: number
  readonly digestType: number
  readonly digest: Hex
}

/** One `RRSetWithSignature` entry for the oracle's `verifyRRSet`. */
export type ProofSet = {
  readonly rrset: Hex
  readonly sig: Hex
}

export type ZoneStep = {
  readonly kind: 'zone'
  readonly zone: string
  readonly parent: string | null
  readonly status: CheckStatus
  readonly checks: readonly DnssecCheck[]
  readonly ds: readonly DsInfo[]
  readonly dnskeys: readonly DnskeyInfo[]
  readonly dsSignatures: readonly SignatureEvaluation[]
  readonly dnskeySignatures: readonly SignatureEvaluation[]
  readonly proofs: {
    readonly ds: ProofSet | null
    readonly dnskey: ProofSet | null
  }
}

/**
 * - `onchain` — `_ens.<name>` TXT `a=0x…`, proven onchain by the DNS registrar
 * - `offchain` — `<name>` TXT `ENS1 …`, proven by the gasless DNS resolver
 */
export type RecordPurpose = 'onchain' | 'offchain'

export type RecordStep = {
  readonly kind: 'record'
  readonly purpose: RecordPurpose
  readonly owner: string
  /** The zone whose keys sign the record, when known. */
  readonly zone: string | null
  readonly status: CheckStatus
  readonly checks: readonly DnssecCheck[]
  readonly values: readonly string[]
  readonly signatures: readonly SignatureEvaluation[]
  readonly proof: ProofSet | null
}

export type DnssecStep = ZoneStep | RecordStep

export type DnssecReport = {
  /** The ASCII (punycode) form of the name, as queried in DNS. */
  readonly name: string
  readonly resolver: DnsResolverId
  /** Unix seconds — signature validity is evaluated at this instant. */
  readonly checkedAt: number
  readonly nameExists: boolean
  /**
   * The zone answering the name's apex. Zones below it are `_ens.<name>`'s
   * own, so only the onchain import depends on them.
   */
  readonly apexZone: string
  readonly zones: readonly ZoneStep[]
  readonly records: readonly RecordStep[]
}
