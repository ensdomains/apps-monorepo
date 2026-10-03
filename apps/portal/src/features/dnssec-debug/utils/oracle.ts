import {
  BaseError,
  ContractFunctionRevertedError,
  type Hex,
  hexToBytes,
} from 'viem'
import type { DnssecReport, ProofSet, RecordPurpose } from '../types'
import { formatUtc } from './time'

type OracleProofEntry = {
  readonly label: string
  readonly zone: string
  readonly proof: ProofSet
}

type OracleRecordRequest = {
  readonly purpose: RecordPurpose
  readonly owner: string
  readonly proofs: readonly ProofSet[]
}

/** Everything the oracle check needs — plain data, so it can key a query. */
export type OracleRequest = {
  readonly checkedAt: number
  readonly entries: readonly OracleProofEntry[]
  /** The first link with no proof to submit, if the chain is incomplete. */
  readonly incompleteAt: string | null
  readonly records: readonly OracleRecordRequest[]
  readonly algorithms: readonly number[]
  readonly digests: readonly number[]
}

const zoneLabel = (zone: string) => (zone === '.' ? '.' : `${zone}.`)

/**
 * Orders the report's signed sets the way the oracle consumes them — the root
 * DNSKEY set, then DS and DNSKEY for each zone down — mirroring the proof
 * dnsprovejs builds for an import.
 */
export const buildOracleRequest = (report: DnssecReport): OracleRequest => {
  const entries: OracleProofEntry[] = []
  let incompleteAt: string | null = null
  for (const step of report.zones) {
    const links = [
      ...(step.parent === null ? [] : [{ type: 'DS', proof: step.proofs.ds }]),
      { type: 'DNSKEY', proof: step.proofs.dnskey },
    ]
    for (const link of links) {
      const label = `${zoneLabel(step.zone)} ${link.type}`
      if (incompleteAt !== null) break
      if (!link.proof) {
        incompleteAt = label
        break
      }
      entries.push({ label, zone: step.zone, proof: link.proof })
    }
  }

  const records = report.records.flatMap((record): OracleRecordRequest[] => {
    // Unset records (`skip`) have nothing ENS would ever ask the oracle to prove.
    if (!record.proof || record.zone === null || record.status === 'skip') {
      return []
    }
    const zoneKeysIndex = entries.findIndex(
      (entry) => entry.label === `${zoneLabel(record.zone ?? '.')} DNSKEY`,
    )
    if (zoneKeysIndex === -1) return []
    return [
      {
        purpose: record.purpose,
        owner: record.owner,
        proofs: [
          ...entries.slice(0, zoneKeysIndex + 1).map((entry) => entry.proof),
          record.proof,
        ],
      },
    ]
  })

  return {
    checkedAt: report.checkedAt,
    entries,
    incompleteAt,
    records,
    algorithms: [
      ...new Set(
        report.zones.flatMap((zone) =>
          zone.dnskeys.map((key) => key.algorithm),
        ),
      ),
    ].sort((a, b) => a - b),
    digests: [
      ...new Set(
        report.zones.flatMap((zone) => zone.ds.map((ds) => ds.digestType)),
      ),
    ].sort((a, b) => a - b),
  }
}

/** A DNS wire-format name (as the oracle's errors carry it) → `a.b.c`. */
export const decodeWireName = (hex: Hex): string => {
  const bytes = hexToBytes(hex)
  const labels: string[] = []
  let offset = 0
  while (offset < bytes.length && bytes[offset] !== 0) {
    const length = bytes[offset]
    labels.push(
      new TextDecoder().decode(bytes.subarray(offset + 1, offset + 1 + length)),
    )
    offset += length + 1
  }
  return labels.length === 0 ? '.' : labels.join('.')
}

type ErrorArgs = readonly unknown[]

const asName = (value: unknown): string =>
  typeof value === 'string' && value.startsWith('0x')
    ? decodeWireName(value as Hex)
    : String(value)

const asTime = (value: unknown): string =>
  typeof value === 'number' || typeof value === 'bigint'
    ? formatUtc(Number(value))
    : String(value)

const ORACLE_ERROR_MESSAGES: Readonly<
  Record<string, (args: ErrorArgs) => string>
> = {
  SignatureExpired: ([expiration]) =>
    `Signature expired at ${asTime(expiration)}.`,
  SignatureNotValidYet: ([inception]) =>
    `Signature is not valid until ${asTime(inception)}.`,
  NoMatchingProof: ([signer]) =>
    `No key or DS record in the proof verifies the signature made by ${asName(signer)}.`,
  ProofNameMismatch: ([signer, proofName]) =>
    `Signed by ${asName(signer)}, but the proof covers ${asName(proofName)}.`,
  InvalidSignerName: ([name, signer]) =>
    `${asName(signer)} is not allowed to sign records for ${asName(name)}.`,
  InvalidLabelCount: ([name]) =>
    `Label count mismatch for ${asName(name)} — usually a wildcard record, which the oracle does not support.`,
  InvalidProofType: ([type]) =>
    `Unexpected record type ${String(type)} used as proof.`,
  SignatureTypeMismatch: () => 'The signature covers a different record type.',
  InvalidClass: ([dnsClass]) => `Unsupported DNS class ${String(dnsClass)}.`,
  InvalidRRSet: () => 'The record set mixes different owner names.',
  OffsetOutOfBoundsError: () => 'The proof data is malformed.',
}

export type OracleOutcome =
  | { readonly status: 'pass' }
  | {
      readonly status: 'fail'
      readonly errorName: string | null
      readonly message: string
    }
  | { readonly status: 'error'; readonly message: string }

/** A `verifyRRSet` revert → what the oracle objected to, in words. */
export const toOracleOutcome = (error: unknown): OracleOutcome => {
  const revert =
    error instanceof BaseError
      ? error.walk((cause) => cause instanceof ContractFunctionRevertedError)
      : null
  if (revert instanceof ContractFunctionRevertedError) {
    const errorName = revert.data?.errorName ?? null
    const describe = errorName ? ORACLE_ERROR_MESSAGES[errorName] : undefined
    return {
      status: 'fail',
      errorName,
      message: describe
        ? describe(revert.data?.args ?? [])
        : (revert.reason ?? revert.shortMessage),
    }
  }
  return {
    status: 'error',
    message: error instanceof BaseError ? error.shortMessage : String(error),
  }
}
