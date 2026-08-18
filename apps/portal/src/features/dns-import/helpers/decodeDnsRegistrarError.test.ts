import { encodeErrorResult, parseAbi } from 'viem'
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
})
