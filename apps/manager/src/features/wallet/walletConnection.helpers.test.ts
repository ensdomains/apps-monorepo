import { describe, expect, it } from 'vitest'
import {
  getConnectedDialogStep,
  isSmartAccountSettled,
  shouldShowSignIn,
} from './walletConnection.helpers'

it.each([
  { isReconnected: true, isOwnedConnection: true },
  { isReconnected: false, isOwnedConnection: false },
])(
  'closes the picker for connections outside its active request: %o',
  (connection) => {
    const step = getConnectedDialogStep({ step: 'wallets', ...connection })
    expect(step).toBe('closed')
    expect(
      shouldShowSignIn({
        step,
        isConnected: true,
        isSignInNeeded: true,
        isAccountSettled: false,
      }),
    ).toBe(false)
  },
)

describe('isSmartAccountSettled', () => {
  it.each([null, { isAccountReady: false, error: 'setup failed' }])(
    'does not block authentication when the smart-account provider is absent or failed: %o',
    (account) => expect(isSmartAccountSettled(account)).toBe(true),
  )
})
