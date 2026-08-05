import { type Address, decodeErrorResult, type Hex } from 'viem'
import {
  LIB_MIGRATION_ERRORS_ABI,
  MIGRATION_HELPER_ABI,
} from '../contracts/abis'
import { OwnedResolverDeployError } from './ensureOwnedPermRes'
import { ProfileFetchError } from './fetchV1Profiles'

export type MigrationError =
  | { type: 'generic'; message: string }
  | { type: 'resolver-deploy-failed'; message: string }
  | {
      type: 'profile-fetch-failed'
      phase: 'subgraph' | 'onchain'
      message: string
    }
  | { type: 'user-rejected' }
  | { type: 'preflight-timeout'; message: string; timeoutMs?: number }
  | { type: 'parent-not-migrated'; parentName: string }
  | { type: 'not-approved-operator'; nft: Address; owner: Address }
  | { type: 'wrapped-owner-mismatch'; tokenId: bigint }
  | { type: 'name-not-locked'; tokenId: bigint }
  | { type: 'name-is-locked'; tokenId: bigint }
  | { type: 'name-data-mismatch'; tokenId: bigint }
  | { type: 'frozen-token-approval'; tokenId: bigint }
  | { type: 'invalid-data' }
  | { type: 'name-requires-migration' }

export const extractErrorMessage = (err: unknown): string => {
  if (!(err instanceof Error)) return String(err)

  let deepest = err
  while ('cause' in deepest && deepest.cause instanceof Error) {
    deepest = deepest.cause
  }

  const short =
    (err as unknown as Record<string, unknown>).shortMessage ??
    (deepest as unknown as Record<string, unknown>).shortMessage

  if (typeof short === 'string') return short
  if (deepest !== err && deepest.message) return deepest.message

  return err.message || 'Migration failed'
}

const walkCauseChain = (err: unknown): Error[] => {
  const chain: Error[] = []
  let cur: unknown = err
  while (cur instanceof Error) {
    chain.push(cur)
    cur = (cur as { cause?: unknown }).cause
  }
  return chain
}

const isUserRejection = (err: unknown): boolean => {
  if (err instanceof Error && err.name === 'MigrationUserRejectedError') {
    return true
  }
  return walkCauseChain(err).some(
    (e) =>
      e.name === 'UserRejectedRequestError' || /user rejected/i.test(e.message),
  )
}

const findTimeoutError = (
  err: unknown,
): (Error & { timeoutMs?: number }) | null => {
  for (const e of walkCauseChain(err)) {
    if (e.name === 'PreflightTimeoutError') {
      return e as Error & { timeoutMs?: number }
    }
  }
  return null
}

const findRevertData = (err: unknown): readonly Hex[] =>
  walkCauseChain(err).flatMap((error) => {
    const data = (error as { data?: unknown }).data
    return typeof data === 'string' && data.startsWith('0x')
      ? [data as Hex]
      : []
  })

// Length-prefixed DNS-encoded name → dotted human-readable name.
const decodeDnsName = (encoded: Hex): string => {
  const bytes = encoded.slice(2)
  const labels: string[] = []
  let i = 0
  while (i < bytes.length) {
    const len = parseInt(bytes.slice(i, i + 2), 16)
    if (len === 0) break
    i += 2
    const labelBytes = bytes.slice(i, i + len * 2)
    let label = ''
    for (let j = 0; j < labelBytes.length; j += 2) {
      label += String.fromCharCode(parseInt(labelBytes.slice(j, j + 2), 16))
    }
    labels.push(label)
    i += len * 2
  }
  return labels.join('.')
}

const tryDecodeHelperError = (data: Hex): MigrationError | null => {
  try {
    const decoded = decodeErrorResult({ abi: MIGRATION_HELPER_ABI, data })
    switch (decoded.errorName) {
      case 'WrappedOwnerMismatch':
        return {
          type: 'wrapped-owner-mismatch',
          tokenId: decoded.args[0] as bigint,
        }
      case 'ParentNotMigrated': {
        const encoded = decoded.args[0] as Hex
        return {
          type: 'parent-not-migrated',
          parentName: decodeDnsName(encoded),
        }
      }
      case 'NotApprovedOperator':
        return {
          type: 'not-approved-operator',
          nft: decoded.args[0] as Address,
          owner: decoded.args[1] as Address,
        }
    }
  } catch {
    // not a helper-typed error
  }
  return null
}

const ERROR_STRING_SELECTOR = '0x08c379a0'
const WRAPPED_ERROR_PREFIX = 'WrappedError::0x'
const MAX_REVERT_UNWRAP_DEPTH = 8

const matchLibMigrationError = (data: Hex): MigrationError | null => {
  try {
    const decoded = decodeErrorResult({ abi: LIB_MIGRATION_ERRORS_ABI, data })
    switch (decoded.errorName) {
      case 'NameNotLocked':
        return { type: 'name-not-locked', tokenId: decoded.args[0] as bigint }
      case 'NameIsLocked':
        return { type: 'name-is-locked', tokenId: decoded.args[0] as bigint }
      case 'NameDataMismatch':
        return {
          type: 'name-data-mismatch',
          tokenId: decoded.args[0] as bigint,
        }
      case 'FrozenTokenApproval':
        return {
          type: 'frozen-token-approval',
          tokenId: decoded.args[0] as bigint,
        }
      case 'InvalidData':
        return { type: 'invalid-data' }
      case 'NameRequiresMigration':
        return { type: 'name-requires-migration' }
    }
  } catch {
    // not a recognized LibMigration error
  }
  return null
}

const decodeErrorStringPayload = (data: Hex): Hex | null => {
  if (!data.toLowerCase().startsWith(ERROR_STRING_SELECTOR)) return null

  try {
    const argsStart = 2 + 8
    const offsetEnd = argsStart + 64
    const offset = Number.parseInt(data.slice(argsStart, offsetEnd), 16)
    const lengthStart = argsStart + offset * 2
    const payloadStart = lengthStart + 64
    const length = Number.parseInt(data.slice(lengthStart, payloadStart), 16)
    const payloadEnd = payloadStart + length * 2

    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(length) ||
      offset < 0 ||
      length < 0 ||
      payloadEnd > data.length
    ) {
      return null
    }

    return `0x${data.slice(payloadStart, payloadEnd)}` as Hex
  } catch {
    return null
  }
}

const hexBytesToAscii = (data: Hex): string => {
  let result = ''
  for (let i = 2; i < data.length; i += 2) {
    result += String.fromCharCode(Number.parseInt(data.slice(i, i + 2), 16))
  }
  return result
}

const parseHexText = (value: string): Hex | null => {
  const unprefixed = value.startsWith('0x') ? value.slice(2) : value
  if (unprefixed.length < 8 || unprefixed.length % 2 !== 0) return null
  if (!/^[0-9a-f]+$/i.test(unprefixed)) return null
  return `0x${unprefixed}` as Hex
}

const getNestedRevertData = (data: Hex): readonly Hex[] => {
  const payload = decodeErrorStringPayload(data)
  if (!payload) return []

  const text = hexBytesToAscii(payload)
  if (text.startsWith(WRAPPED_ERROR_PREFIX)) {
    const wrapped = parseHexText(text.slice(WRAPPED_ERROR_PREFIX.length))
    return wrapped ? [wrapped] : []
  }

  const encodedAsText = parseHexText(text)
  return encodedAsText ? [encodedAsText] : [payload]
}

const matchMigrationRevert = (data: Hex, depth = 0): MigrationError | null => {
  if (depth >= MAX_REVERT_UNWRAP_DEPTH) return null

  const directMatch = tryDecodeHelperError(data) ?? matchLibMigrationError(data)
  if (directMatch) return directMatch

  for (const inner of getNestedRevertData(data)) {
    const nestedMatch = matchMigrationRevert(inner, depth + 1)
    if (nestedMatch) return nestedMatch
  }

  return null
}

export const decodeMigrationError = (err: unknown): MigrationError => {
  if (isUserRejection(err)) return { type: 'user-rejected' }

  const timeout = findTimeoutError(err)
  if (timeout) {
    return {
      type: 'preflight-timeout',
      message: extractErrorMessage(timeout),
      timeoutMs: timeout.timeoutMs,
    }
  }

  if (err instanceof OwnedResolverDeployError) {
    return { type: 'resolver-deploy-failed', message: extractErrorMessage(err) }
  }
  if (err instanceof ProfileFetchError) {
    return {
      type: 'profile-fetch-failed',
      phase: err.phase,
      message: extractErrorMessage(err),
    }
  }

  for (const revertData of findRevertData(err)) {
    const match = matchMigrationRevert(revertData)
    if (match) return match
  }

  return { type: 'generic', message: extractErrorMessage(err) }
}
