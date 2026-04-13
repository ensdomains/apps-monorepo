import { type Abi, BaseError, decodeErrorResult, parseAbi } from 'viem'
import type { SkipReason } from './migrationService'

const MIGRATION_ERROR_ABI = parseAbi([
  'error InvalidData()',
  'error NameDataMismatch(uint256 tokenId, string label)',
  'error NameIsLocked(uint256 tokenId)',
  'error NameNotLocked(uint256 tokenId)',
  'error FrozenTokenApproval(uint256 tokenId, address approved)',
])

const ERROR_NAME_TO_REASON: Record<string, SkipReason> = {
  InvalidData: 'invalid-data',
  NameDataMismatch: 'name-data-mismatch',
  NameIsLocked: 'name-is-locked',
  NameNotLocked: 'name-not-locked',
  FrozenTokenApproval: 'frozen-token-approval',
}

const hasDataField = (e: unknown): e is { data: string } =>
  typeof e === 'object' &&
  e !== null &&
  'data' in e &&
  typeof (e as Record<string, unknown>).data === 'string'

const extractRevertData = (error: unknown): `0x${string}` | null => {
  if (error instanceof BaseError) {
    const walk = error.walk((e) => hasDataField(e) && e.data.startsWith('0x'))
    if (walk && hasDataField(walk)) {
      return walk.data as `0x${string}`
    }
  }
  return null
}

export const decodeMigrationRevertReason = (error: unknown): SkipReason => {
  const data = extractRevertData(error)
  if (!data) return 'transfer-failed'

  try {
    const decoded = decodeErrorResult({
      abi: MIGRATION_ERROR_ABI as Abi,
      data,
    })
    return ERROR_NAME_TO_REASON[decoded.errorName] ?? 'transfer-failed'
  } catch (decodeError) {
    console.warn('[migration] Failed to decode revert:', decodeError)
    return 'transfer-failed'
  }
}
