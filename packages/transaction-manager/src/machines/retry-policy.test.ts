import { describe, expect, it } from 'vitest'
import {
  SignerAddressMismatchError,
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
        new SignerAddressMismatchError(request, '0x1', '0x2'),
      ),
    ).toBe(false)
  })

  it('does not retry a desynced nonce', () => {
    expect(isRetryableSubmissionError(new Error('nonce too low'))).toBe(false)
  })
})
