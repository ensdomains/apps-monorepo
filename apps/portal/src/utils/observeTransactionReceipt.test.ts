import { expect, it, vi } from 'vitest'
import { createActor, createMachine } from 'xstate'
import { observeTransactionReceipt } from './observeTransactionReceipt'

const getTransaction = vi.hoisted(() => vi.fn())

vi.mock('@ens-apps/transaction-manager/providers/transactionManager', () => ({
  transactionManager: {
    getTransaction,
    onTransactionsChange: () => () => {},
  },
}))

it.each([
  ['TIMEOUT', 'unobserved'],
  ['UNKNOWN', 'unobserved'],
  ['REVERT', 'failed'],
  ['REJECT', 'failed'],
  ['CANCEL', 'unobserved'],
] as const)(
  'classifies %s without claiming an unknown chain outcome failed',
  async (event, status) => {
    const actor = createActor(
      createMachine({
        initial: 'pending',
        states: {
          pending: {
            on: {
              TIMEOUT: 'error.timeout',
              UNKNOWN: 'error.unknown',
              REVERT: 'error.reverted',
              REJECT: 'error.submission',
              CANCEL: 'error.cancelled',
            },
          },
          error: {
            initial: 'timeout',
            states: {
              timeout: {},
              unknown: {},
              reverted: {},
              submission: {},
              cancelled: {},
            },
          },
        },
      }),
    ).start()
    getTransaction.mockReturnValue(actor)
    const observe = vi.fn()
    observeTransactionReceipt('tx', observe)
    actor.send({ type: event })
    await vi.waitFor(() =>
      expect(observe).toHaveBeenCalledExactlyOnceWith({ status }),
    )
    actor.stop()
  },
)
