import { describe, expect, it } from 'vitest'
import { getWalletDialogView, isSmartAccountSettled } from './walletDialogView'

describe('getWalletDialogView', () => {
  it.each([
    ['closed', true, 'standalone-sign-in'],
    ['closed', false, 'none'],
    ['choosing', true, 'choose-wallet'],
    ['pairing', true, 'none'],
  ] as const)(
    'with a connected wallet needing sign-in, %s and account settled=%s shows %s',
    (connectFlow, isAccountSettled, expected) => {
      expect(
        getWalletDialogView({
          connectFlow,
          isConnected: true,
          isSignInNeeded: true,
          isAccountSettled,
        }),
      ).toBe(expected)
    },
  )
})

describe('isSmartAccountSettled', () => {
  it.each([null, { isAccountReady: false, error: 'setup failed' }])(
    'does not block authentication when the smart-account provider is absent or failed: %o',
    (smartAccount) => {
      expect(isSmartAccountSettled(smartAccount)).toBe(true)
    },
  )
})
