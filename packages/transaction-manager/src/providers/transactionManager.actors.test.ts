/**
 * Actor-lifetime cover for the manager's in-memory map.
 *
 * A settled actor is kept after it is archived — the modal reads a finished
 * step's status, hash and actual cost straight off its snapshot — so the map
 * is pruned at the flow's boundaries instead: when an id is taken over by a
 * new attempt, and when the connected wallet changes. Neither may ever stop an
 * actor that is still in flight.
 */

import type { Address } from 'viem'
import { afterEach, describe, expect, it } from 'vitest'
import { TransactionStoppedError } from '../errors/transaction.errors'
import { waitForTransaction } from '../helpers/waitForTransaction'
import {
  createCountingWallet,
  resetTransactionManager,
  runStepToSuccess,
  startStep,
  testIntent,
} from '../test-utils/transactionActor'
import {
  isTransactionSettled,
  resolveOwnerAccount,
  transactionManager,
} from './transactionManager'

const ACCOUNT_A = '0x1111111111111111111111111111111111111111' as Address
const ACCOUNT_B = '0x2222222222222222222222222222222222222222' as Address

/** Lets queued microtasks (actor transitions, awaited transports) drain. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  resetTransactionManager()
})

describe('resolveOwnerAccount', () => {
  it('reads the account off a custom intent request', () => {
    expect(resolveOwnerAccount({ intent: testIntent(ACCOUNT_A) })).toBe(
      ACCOUNT_A.toLowerCase(),
    )
  })

  it('reads it off a renewal intent', () => {
    expect(
      resolveOwnerAccount({
        intent: {
          type: 'ens-renewal',
          name: 'leon',
          duration: 1n,
          from: ACCOUNT_A,
        },
      }),
    ).toBe(ACCOUNT_A.toLowerCase())
  })

  it('is undefined when there is no intent or request', () => {
    expect(resolveOwnerAccount({})).toBeUndefined()
  })
})

describe('reusing a transaction id', () => {
  it('retires a settled actor so the step can run again', async () => {
    const wallet = createCountingWallet(ACCOUNT_A)

    await runStepToSuccess('tx-step', wallet)
    const first = transactionManager.getTransaction('tx-step')
    expect(first?.getSnapshot().value).toBe('success')

    await runStepToSuccess('tx-step', wallet)
    const second = transactionManager.getTransaction('tx-step')

    expect(second).not.toBe(first)
    expect(first?.getSnapshot().status).toBe('stopped')
    expect(wallet.walletRequests()).toBe(2)
    expect(transactionManager.getTransactions().size).toBe(1)
  })

  it('hands back the running transaction instead of starting a second one', async () => {
    // A double-clicked step must not open a second wallet prompt, and must
    // never stop the actor whose prompt is already open.
    const wallet = createCountingWallet(ACCOUNT_A)
    const held = wallet.hold()

    const firstId = startStep('tx-step', wallet)
    const actor = transactionManager.getTransaction('tx-step')
    await settle()

    const secondId = startStep('tx-step', wallet)

    expect(secondId).toBe(firstId)
    expect(transactionManager.getTransaction('tx-step')).toBe(actor)
    expect(actor?.getSnapshot().status).toBe('active')
    expect(wallet.walletRequests()).toBe(1)

    held.release()
    await expect(waitForTransaction(firstId)).resolves.toMatchObject({
      hash: expect.any(String),
    })
  })
})

describe('setConnectedAccount', () => {
  it('retires the settled actors another account owns', async () => {
    const wallet = createCountingWallet(ACCOUNT_A)
    transactionManager.setConnectedAccount(ACCOUNT_A)

    await runStepToSuccess('tx-step', wallet)
    expect(transactionManager.getTransaction('tx-step')).toBeDefined()

    transactionManager.setConnectedAccount(ACCOUNT_B)

    expect(transactionManager.getTransaction('tx-step')).toBeUndefined()
    expect(transactionManager.getTransactions().size).toBe(0)
  })

  it('lets an in-flight transaction of the previous account finish first', async () => {
    // Stopping it would strand its waiter and lose its history entry, while
    // the transaction still lands on-chain.
    const wallet = createCountingWallet(ACCOUNT_A)
    transactionManager.setConnectedAccount(ACCOUNT_A)

    const held = wallet.hold()
    const txId = startStep('tx-step', wallet)
    const waiting = waitForTransaction(txId)
    await settle()

    transactionManager.setConnectedAccount(ACCOUNT_B)

    expect(transactionManager.getTransaction('tx-step')).toBeDefined()
    expect(
      isTransactionSettled(
        // biome-ignore lint/style/noNonNullAssertion: asserted defined above
        transactionManager.getTransaction('tx-step')!,
      ),
    ).toBe(false)

    held.release()
    await expect(waiting).resolves.toMatchObject({ hash: expect.any(String) })

    // Settled now, so it is dropped rather than lingering as another
    // account's finished step.
    expect(transactionManager.getTransaction('tx-step')).toBeUndefined()
  })

  it('retires nothing when the connected wallet becomes unknown', async () => {
    // A lock, a reload or a reconnect reports `undefined`. That is not another
    // wallet taking over, and throwing away the actors the open modal renders
    // would force the user to re-run steps that already succeeded on-chain.
    const wallet = createCountingWallet(ACCOUNT_A)
    transactionManager.setConnectedAccount(ACCOUNT_A)
    await runStepToSuccess('tx-step', wallet)

    transactionManager.setConnectedAccount(undefined)

    expect(transactionManager.getTransaction('tx-step')).toBeDefined()
  })

  it('keeps the current account’s actors when the same account is re-stated', async () => {
    const wallet = createCountingWallet(ACCOUNT_A)
    transactionManager.setConnectedAccount(ACCOUNT_A)
    await runStepToSuccess('tx-step', wallet)

    transactionManager.setConnectedAccount(ACCOUNT_A)

    expect(transactionManager.getTransaction('tx-step')).toBeDefined()
  })

  it('notifies subscribers when it prunes', async () => {
    const wallet = createCountingWallet(ACCOUNT_A)
    transactionManager.setConnectedAccount(ACCOUNT_A)
    await runStepToSuccess('tx-step', wallet)

    const sizes: number[] = []
    const unsubscribe = transactionManager.onTransactionsChange((txs) =>
      sizes.push(txs.size),
    )

    transactionManager.setConnectedAccount(ACCOUNT_B)
    unsubscribe()

    expect(sizes).toEqual([0])
  })
})

describe('clear', () => {
  it('rejects anything waiting on an actor it stops', async () => {
    // `clear()` is a hard reset that reaches outside any one flow, so a waiter
    // must be told rather than left hanging for the rest of the session.
    const wallet = createCountingWallet(ACCOUNT_A)
    const held = wallet.hold()
    const txId = startStep('tx-step', wallet)
    const waiting = waitForTransaction(txId)
    await settle()

    transactionManager.clear()

    await expect(waiting).rejects.toBeInstanceOf(TransactionStoppedError)
    held.release()
  })
})
