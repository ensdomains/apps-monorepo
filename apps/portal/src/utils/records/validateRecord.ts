import { isAddress } from 'viem'
import type { EditableRecord } from './editRecordUtils'

export interface ValidationError {
  recordId: string
  message: string
}

/** Text record keys that should contain valid URLs */
const URL_KEYS = new Set(['avatar', 'url', 'banner', 'header', 'cover'])

/** Text record keys that should contain valid email addresses */
const EMAIL_KEYS = new Set(['email'])

/**
 * Validates a URL string.
 * Accepts http://, https://, ipfs://, and ipns:// protocols.
 */
function isValidUrl(value: string): boolean {
  if (!value) return true // Empty is valid (means deletion)

  try {
    const url = new URL(value)
    return ['http:', 'https:', 'ipfs:', 'ipns:'].includes(url.protocol)
  } catch {
    return false
  }
}

/**
 * Validates an email address using a simple regex.
 */
function isValidEmail(value: string): boolean {
  if (!value) return true // Empty is valid (means deletion)

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(value)
}

/**
 * Validates an Ethereum address.
 * Uses strict: false to skip EIP-55 checksum validation,
 * accepting any valid hex address format.
 */
function isValidEthereumAddress(value: string): boolean {
  if (!value) return true // Empty is valid (means deletion)

  return isAddress(value, { strict: false })
}

/**
 * Validates a contentHash value.
 * Must use a supported protocol (ipfs://, ipns://, ar://, onion://, sia://).
 */
function isValidContentHash(value: string): boolean {
  if (!value) return true // Empty is valid (means deletion)

  // Check for supported protocols
  const supportedProtocols = [
    'ipfs://',
    'ipns://',
    'ar://',
    'onion://',
    'sia://',
  ]
  const hasValidProtocol = supportedProtocols.some((protocol) =>
    value.startsWith(protocol),
  )

  if (!hasValidProtocol) {
    return false
  }

  // Basic check that there's content after the protocol
  const protocolIndex = value.indexOf('://')
  const content = value.slice(protocolIndex + 3)
  return content.length > 0
}

/**
 * Validates an ABI value - must be valid JSON.
 */
function isValidAbi(value: string): boolean {
  if (!value) return true // Empty is valid (means deletion)

  try {
    JSON.parse(value)
    return true
  } catch {
    return false
  }
}

/**
 * Validates a single record and returns an error message if invalid.
 *
 * @param record - The record to validate
 * @returns An error message if invalid, null if valid
 */
export function validateRecord(record: EditableRecord): string | null {
  const { type, value } = record

  // Skip validation for deleted records
  if (record.isDeleted) return null

  // Empty values are always valid (they represent deletion)
  if (!value || value.trim() === '') return null

  if (type === 'text') {
    const key = record.key.toLowerCase()

    // URL validation
    if (URL_KEYS.has(key)) {
      if (!isValidUrl(value)) {
        return `Invalid URL format. Must start with http://, https://, ipfs://, or ipns://`
      }
    }

    // Email validation
    if (EMAIL_KEYS.has(key)) {
      if (!isValidEmail(value)) {
        return 'Invalid email address format'
      }
    }
  }

  if (type === 'address') {
    // Only validate ETH addresses (coinType 60)
    if (record.id === 60 && !isValidEthereumAddress(value)) {
      return 'Invalid Ethereum address format'
    }
  }

  if (type === 'contentHash') {
    if (!isValidContentHash(value)) {
      return 'Invalid contentHash. Must start with ipfs://, ipns://, ar://, onion://, or sia:// followed by a valid identifier'
    }
  }

  if (type === 'abi') {
    if (!isValidAbi(value)) {
      return 'Invalid JSON format'
    }
  }

  return null
}

/**
 * Validates all records and returns an array of validation errors.
 *
 * @param records - The records to validate
 * @returns Array of validation errors (empty if all valid)
 */
export function validateRecords(records: EditableRecord[]): ValidationError[] {
  const errors: ValidationError[] = []

  for (const record of records) {
    // Only validate edited or new records
    if (!record.isEdited && !record.isNew) continue

    const error = validateRecord(record)
    if (error) {
      // Include _uid in recordId for new records to ensure uniqueness
      const uid = record._uid ? `-${record._uid}` : ''
      const recordId =
        record.type === 'contentHash'
          ? `contentHash${uid}`
          : record.type === 'abi'
            ? `abi${uid}`
            : record.type === 'address'
              ? `address-${record.key}${uid}`
              : `text-${record.key}${uid}`

      errors.push({ recordId, message: error })
    }
  }

  return errors
}

/**
 * Gets a validation error for a specific record by ID.
 *
 * @param errors - Array of validation errors
 * @param recordId - The record ID to find
 * @returns The error message or undefined if no error
 */
export function getRecordError(
  errors: ValidationError[],
  recordId: string,
): string | undefined {
  return errors.find((e) => e.recordId === recordId)?.message
}
