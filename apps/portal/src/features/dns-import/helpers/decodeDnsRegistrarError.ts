import { dnsRegistrarErrors } from '@ensdomains/ensjs-abi/dnsRegistrar'
import {
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  type Hex,
} from 'viem'

const DNS_REGISTRAR_ERROR_MESSAGES: Record<string, string> = {
  NoOwnerRecordFound:
    'No valid ownership record was found in the DNSSEC proof. Check the _ens TXT record and refresh.',
  PermissionDenied:
    'Only the address in the DNS record can claim this name with a resolver. Connect that wallet, or import without ownership.',
  PreconditionNotMet: 'The claim preconditions were not met. Please retry.',
  StaleProof:
    'The DNS record changed since the proof was fetched. Refresh and try again.',
  InvalidPublicSuffix:
    'This domain ending is not supported for onchain import.',
}

/**
 * Maps a DNSRegistrar revert to a user-facing message, or null when the error
 * is not a recognized registrar revert. Accepts either a viem error chain
 * (walks to the revert data) or raw revert data.
 */
export const decodeDnsRegistrarError = (error: unknown): string | null => {
  const data = extractRevertData(error)
  if (!data) return null
  try {
    const decoded = decodeErrorResult({ abi: dnsRegistrarErrors, data })
    return DNS_REGISTRAR_ERROR_MESSAGES[decoded.errorName] ?? null
  } catch {
    return null
  }
}

const extractRevertData = (error: unknown): Hex | null => {
  if (typeof error === 'string' && error.startsWith('0x')) return error as Hex
  if (!(error instanceof BaseError)) return null
  const revert = error.walk((e) => e instanceof ContractFunctionRevertedError)
  if (revert instanceof ContractFunctionRevertedError) {
    return revert.raw ?? null
  }
  return null
}
