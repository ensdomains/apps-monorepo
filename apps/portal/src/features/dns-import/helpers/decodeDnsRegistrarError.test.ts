import {
  BaseError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  parseAbi,
} from 'viem'
import { describe, expect, it } from 'vitest'
import { decodeDnsRegistrarError } from './decodeDnsRegistrarError'

const abi = parseAbi([
  'error StaleProof()',
  'error PermissionDenied(address caller, address owner)',
])

describe('decodeDnsRegistrarError', () => {
  it('decodes StaleProof revert data to a friendly message', () => {
    const data = encodeErrorResult({ abi, errorName: 'StaleProof' })
    expect(decodeDnsRegistrarError(data)).toMatch(/record changed/i)
  })

  it('decodes PermissionDenied revert data to a friendly message', () => {
    const data = encodeErrorResult({
      abi,
      errorName: 'PermissionDenied',
      args: [
        '0x0b08dA7068b73A579Bd5E8a8290ff8afd37bc32A',
        '0x5eb3Bc0a489C5A8288765d2336659EbCA68FCd00',
      ],
    })
    expect(decodeDnsRegistrarError(data)).toMatch(/import without ownership/i)
  })

  it('returns null for unrecognized revert data', () => {
    expect(decodeDnsRegistrarError('0xdeadbeef')).toBeNull()
  })

  it('returns null for non-revert errors', () => {
    expect(decodeDnsRegistrarError(new Error('boom'))).toBeNull()
  })

  it('walks a viem error chain down to the revert data', () => {
    const data = encodeErrorResult({ abi, errorName: 'StaleProof' })
    const revert = new ContractFunctionRevertedError({
      abi,
      data,
      functionName: 'proveAndClaim',
    })
    const chained = new BaseError('Execution reverted.', { cause: revert })
    expect(decodeDnsRegistrarError(chained)).toMatch(/record changed/i)
  })

  it('returns null for a viem revert without raw data', () => {
    const revert = new ContractFunctionRevertedError({
      abi,
      functionName: 'proveAndClaim',
    })
    const chained = new BaseError('Execution reverted.', { cause: revert })
    expect(decodeDnsRegistrarError(chained)).toBeNull()
  })

  it('returns null for a viem error chain without a revert', () => {
    expect(decodeDnsRegistrarError(new BaseError('rpc timeout'))).toBeNull()
  })
})
