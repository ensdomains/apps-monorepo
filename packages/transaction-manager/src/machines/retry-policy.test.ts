import { mainnet, sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import {
  ChainIdMismatchError,
  SessionRefundCapExceededError,
  SignerAddressMismatchError,
  TransactionSubmissionError,
  TransactionUserRejectedError,
} from '../errors/transaction.errors'
import type { EOATransactionRequest } from '../types/transaction.types'
import { isRetryableSubmissionError } from './retry-policy'

const request = {
  type: 'eoa',
  from: '0x000000000000000000000000000000000000aaaa',
  to: '0x000000000000000000000000000000000000cccc',
} as EOATransactionRequest

describe('isRetryableSubmissionError', () => {
  it('retries an ordinary failure', () => {
    expect(isRetryableSubmissionError(new Error('socket hang up'))).toBe(true)
  })

  it('does not retry the shape a cancelled transaction actually produces', () => {
    const rejection = new Error('User rejected the request.')
    rejection.name = 'UserRejectedRequestError'
    const wrapper = new Error('Failed to submit transaction', {
      cause: rejection,
    })
    wrapper.name = 'eu'
    expect(isRetryableSubmissionError(wrapper)).toBe(false)
  })

  it('does not retry a typed rejection with no cause', () => {
    expect(
      isRetryableSubmissionError(new TransactionUserRejectedError(request)),
    ).toBe(false)
  })

  it('does not retry a signer mismatch', () => {
    expect(
      isRetryableSubmissionError(
        new SignerAddressMismatchError(request.from, '0x2'),
      ),
    ).toBe(false)
  })

  it('does not retry a chain mismatch', () => {
    expect(
      isRetryableSubmissionError(new ChainIdMismatchError(mainnet.id, sepolia)),
    ).toBe(false)
  })

  it('does not retry a quote outside the session refund caps', () => {
    expect(
      isRetryableSubmissionError(
        new SessionRefundCapExceededError(request, [
          { field: 'gasOverhead', quoted: 3_000_000n, cap: 500_000n },
        ]),
      ),
    ).toBe(false)
  })

  // The orchestrator's simulation of an under-funded account: resubmitting the
  // same intent can only fail the same way.
  it('does not retry what the orchestrator marks non-retryable', () => {
    const insufficientBalance = Object.assign(
      new Error('Simulation failed due to insufficient token balance'),
      {
        errorType: 'Unprocessable Entity',
        statusCode: 422,
        context: { category: 'INSUFFICIENT_BALANCE', retryable: false },
      },
    )
    expect(
      isRetryableSubmissionError(
        new TransactionSubmissionError(request, insufficientBalance),
      ),
    ).toBe(false)
  })

  it('still retries what the orchestrator marks retryable', () => {
    const transient = Object.assign(new Error('Simulation failed'), {
      context: { retryable: true },
    })
    expect(
      isRetryableSubmissionError(
        new TransactionSubmissionError(request, transient),
      ),
    ).toBe(true)
  })

  it('does not retry a desynced nonce', () => {
    expect(isRetryableSubmissionError(new Error('nonce too low'))).toBe(false)
  })
})
