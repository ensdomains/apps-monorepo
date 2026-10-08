import { TransactionExecutionError, UserRejectedRequestError } from 'viem'
import { describe, expect, it } from 'vitest'
import { isTerminalWalletError } from './wallet-errors.helpers'

describe('isTerminalWalletError', () => {
  it('finds a rejection under the transport wrapper', () => {
    const wrapped = new Error('Failed to submit transaction', {
      cause: new TransactionExecutionError(
        new UserRejectedRequestError(new Error('User rejected')),
        {},
      ),
    })
    expect(isTerminalWalletError(wrapped)).toBe(true)
  })

  it('finds one when class identity is lost to minification', () => {
    const rejection = new Error('User rejected the request.')
    rejection.name = 'UserRejectedRequestError'
    const wrapper = new Error('Failed to submit transaction', {
      cause: rejection,
    })
    wrapper.name = 'eu'
    expect(isTerminalWalletError(wrapper)).toBe(true)
  })

  it('finds a 4100, which a wallet returns once its spam filter trips', () => {
    expect(
      isTerminalWalletError(
        Object.assign(new Error('blocked'), { code: 4100 }),
      ),
    ).toBe(true)
  })

  it('leaves an ordinary failure retryable', () => {
    expect(isTerminalWalletError(new Error('socket hang up'))).toBe(false)
  })

  it('does not spin on a cyclic cause', () => {
    const a = new Error('a') as Error & { cause?: unknown }
    const b = new Error('b') as Error & { cause?: unknown }
    a.cause = b
    b.cause = a
    expect(isTerminalWalletError(a)).toBe(false)
  })
})
