import { ResultAsync } from 'neverthrow'
import { describe, expect, it, vi } from 'vitest'
import { createActor } from 'xstate'
import {
  TEST_TX_HASH,
  testPublicClient,
} from '../../test-utils/transactionActor'
import { registrationMachine } from './registration.machine'

const submit = vi.hoisted(() => vi.fn())
vi.mock('./registration.actors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./registration.actors')>()),
  submitRegistrationActor: submit,
}))
vi.mock('./registration.hca.actors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./registration.hca.actors')>()),
  submitRevealBatchActor: submit,
}))

describe('registration queued operation notification', () => {
  it.each(['submitRegistration', 'submitRevealBatch'] as const)(
    '%s notifies after its actor stops while the real async operation is pending',
    async (actorName) => {
      let queued = (_txId: string) => {}
      const operation = new Promise<string>((resolve) => {
        queued = resolve
      })
      submit.mockReturnValue(
        ResultAsync.fromPromise(operation, (cause) => cause),
      )
      const onRegistrationQueued = vi.fn()
      const verification = {
        mode: 'eoa',
        input: {
          name: 'queued.eth',
          owner: '0x1111111111111111111111111111111111111111',
          resolverAddress: '0x2222222222222222222222222222222222222222',
          publicClient: testPublicClient,
          commitment: TEST_TX_HASH,
        },
      } as const
      const implementation =
        registrationMachine.implementations.actors?.[actorName]
      const logic =
        implementation && 'src' in implementation
          ? implementation.src
          : implementation
      if (!logic) throw new Error(`Missing actor ${actorName}`)
      const actor = createActor(logic, {
        input: { onRegistrationQueued, verification },
      }).start()
      actor.stop()
      queued('reveal-tx')
      await vi.waitFor(() =>
        expect(onRegistrationQueued).toHaveBeenCalledWith(
          'reveal-tx',
          verification,
        ),
      )
      expect(onRegistrationQueued).toHaveBeenCalledOnce()
    },
  )

  it.each(['submitRegistration', 'submitRevealBatch'] as const)(
    '%s keeps the queued result when an optional observer throws',
    async (actorName) => {
      submit.mockReturnValue(
        ResultAsync.fromSafePromise(Promise.resolve('queued-tx')),
      )
      const implementation =
        registrationMachine.implementations.actors?.[actorName]
      const logic =
        implementation && 'src' in implementation
          ? implementation.src
          : implementation
      if (!logic) throw new Error(`Missing actor ${actorName}`)
      const onRegistrationQueued = vi.fn(() => {
        throw new Error('observer unavailable')
      })
      const actor = createActor(logic, {
        input: { onRegistrationQueued },
      }).start()
      await vi.waitFor(() => expect(actor.getSnapshot().status).toBe('done'))
      expect(onRegistrationQueued).toHaveBeenCalledWith('queued-tx', undefined)
      expect(actor.getSnapshot().output).toBe('queued-tx')
      actor.stop()
    },
  )
})
