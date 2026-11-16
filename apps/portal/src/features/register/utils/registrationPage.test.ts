import { describe, expect, it } from 'vitest'
import { isRunAtEthAddressRetry, shouldShowNameTaken } from './registrationPage'

describe('isRunAtEthAddressRetry', () => {
  it.each([
    ['failed at the ETH address', 'error', 'settingEthAddress', true],
    ['failed at register', 'error', 'registeringDomain', false],
    ['lost the name to another address', 'error', undefined, false],
    ['still setting it', 'settingEthAddress', undefined, false],
  ])('a run that %s', (_, value, retryTarget, expected) => {
    expect(isRunAtEthAddressRetry({ value, context: { retryTarget } })).toBe(
      expected,
    )
  })
})

describe('shouldShowNameTaken', () => {
  const page = { isNameTaken: true, isRegistering: false, isSuccess: false }

  it('keeps the modal for a run whose ETH address failed after register', () => {
    expect(shouldShowNameTaken({ ...page, isEthAddressRetryAhead: true })).toBe(
      false,
    )
  })

  it('shows a name another address registered as taken', () => {
    expect(
      shouldShowNameTaken({ ...page, isEthAddressRetryAhead: false }),
    ).toBe(true)
  })
})
