import {
  BaseError,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  toHex,
} from 'viem'
import { describe, expect, it } from 'vitest'
import { dnssecOracleAbi } from '../constants'
import { decodeWireName, toOracleOutcome } from './oracle'
import { encodeDnsName } from './wire'

const revert = (data: `0x${string}`) =>
  new ContractFunctionExecutionError(
    new ContractFunctionRevertedError({
      abi: dnssecOracleAbi,
      data,
      functionName: 'verifyRRSet',
    }),
    { abi: dnssecOracleAbi, functionName: 'verifyRRSet', args: [[]] },
  )

describe('decodeWireName', () => {
  it('decodes wire-format names', () => {
    expect(decodeWireName(toHex(encodeDnsName('example.com')))).toBe(
      'example.com',
    )
    expect(decodeWireName('0x00')).toBe('.')
  })
})

describe('toOracleOutcome', () => {
  it('explains a SignatureExpired revert', () => {
    const data = encodeErrorResult({
      abi: dnssecOracleAbi,
      errorName: 'SignatureExpired',
      args: [1_800_000_000, 1_800_000_100],
    })
    expect(toOracleOutcome(revert(data))).toEqual({
      status: 'fail',
      errorName: 'SignatureExpired',
      message: 'Signature expired at 2027-01-15 08:00 UTC.',
    })
  })

  it('decodes the signer name in NoMatchingProof', () => {
    const data = encodeErrorResult({
      abi: dnssecOracleAbi,
      errorName: 'NoMatchingProof',
      args: [toHex(encodeDnsName('example.com'))],
    })
    expect(toOracleOutcome(revert(data))).toMatchObject({
      status: 'fail',
      errorName: 'NoMatchingProof',
      message:
        'No key or DS record in the proof verifies the signature made by example.com.',
    })
  })

  it('reports transport failures separately from rejections', () => {
    expect(toOracleOutcome(new BaseError('HTTP request failed'))).toEqual({
      status: 'error',
      message: 'HTTP request failed',
    })
  })
})
