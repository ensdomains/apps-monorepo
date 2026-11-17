import { describe, expect, it } from 'vitest'
import { createActor } from 'xstate'
import {
  isSmartAccountSettled,
  walletConnectionMachine,
} from './walletConnection.machine'

const input = {
  isConnected: false,
  isSignInNeeded: true,
  isAccountSettled: false,
  isSigning: false,
  hasSignInError: false,
} as const

it('closes the picker on eager reconnection without starting the sign-in step', () => {
  const actor = createActor(walletConnectionMachine, { input }).start()
  actor.send({ type: 'OPEN' })
  actor.send({ type: 'CONNECTED', isReconnected: true })
  expect(actor.getSnapshot().matches('closed')).toBe(true)
  actor.stop()
})

it('does not open the dialog for a connection started outside it while the account prepares', () => {
  const actor = createActor(walletConnectionMachine, { input }).start()
  actor.send({ type: 'CONNECTED', isReconnected: false })
  expect(actor.getSnapshot().matches('closed')).toBe(true)
  actor.stop()
})

describe('isSmartAccountSettled', () => {
  it.each([null, { isAccountReady: false, error: 'setup failed' }])(
    'does not block authentication when the smart-account provider is absent or failed: %o',
    (account) => expect(isSmartAccountSettled(account)).toBe(true),
  )
})
