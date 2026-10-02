import {
  createFlowScope,
  transactionManager,
} from '@ens-apps/transaction-manager'
import {
  createCountingWallet,
  resetTransactionManager,
  runStepToSuccess,
} from '@ens-apps/transaction-manager/test-utils/transactionActor'
import type { Address } from 'viem'
import { afterEach, describe, expect, it } from 'vitest'
import type { Transaction } from '@/features/transaction-manager/types'
import { getActiveTransaction } from '@/features/transaction-manager/utils/getActiveTransaction'
import { getStatus } from '@/features/transaction-manager/utils/getStatus'
import type { TransferStepKind } from './buildTransferPlan'
import { transferStepId } from './transferStepId'

const NAME = 'example.eth'
const SENDER = '0x1111111111111111111111111111111111111111' as Address
const OTHER_ACCOUNT = '0x2222222222222222222222222222222222222222' as Address

/** A two-step plan: detach the resolver, then move the token. */
const STEPS: readonly TransferStepKind[] = ['detach-resolver', 'transfer-token']

const planIds = (scope: ReturnType<typeof createFlowScope>) =>
  STEPS.map((step) => transferStepId(NAME, step, scope))

/** The shape the modal reads: only the ids matter here. */
const asTransactions = (ids: readonly string[]): Transaction[] =>
  ids.map((id) => ({
    id,
    title: id,
    transactionName: id,
    onStart: () => {},
    onDone: () => {},
  }))

const statusOf = (id: string) =>
  getStatus(id, transactionManager.getTransactions())

afterEach(() => {
  resetTransactionManager()
})

describe('transferStepId', () => {
  it('keeps the plain step id when no attempt is in progress', () => {
    expect(transferStepId(NAME, 'transfer-token', null)).toBe(
      `transfer-${NAME}-transfer-token`,
    )
  })

  it('names the same step differently for two attempts', () => {
    const first = transferStepId(
      NAME,
      'transfer-token',
      createFlowScope(SENDER),
    )
    const second = transferStepId(
      NAME,
      'transfer-token',
      createFlowScope(SENDER),
    )

    expect(first).not.toBe(second)
    expect(first.startsWith(`transfer-${NAME}-transfer-token`)).toBe(true)
  })

  it('names the same step differently for two accounts', () => {
    const mine = transferStepId(NAME, 'transfer-token', createFlowScope(SENDER))
    const theirs = transferStepId(
      NAME,
      'transfer-token',
      createFlowScope(OTHER_ACCOUNT),
    )

    expect(mine).not.toBe(theirs)
  })
})

describe('retrying an abandoned transfer', () => {
  it('starts the retry from step 1', async () => {
    const wallet = createCountingWallet(SENDER)

    // Attempt 1 gets through step 1, then the user walks away.
    const abandoned = planIds(createFlowScope(SENDER))
    await runStepToSuccess(abandoned[0], wallet)
    expect(statusOf(abandoned[0])).toBe('success')
    expect(wallet.walletRequests()).toBe(1)

    // The retry only scopes a fresh attempt — nothing is cleared, because
    // clearing would also stop unrelated in-flight work. The abandoned
    // attempt's finished actor is still in the manager.
    const retry = planIds(createFlowScope(SENDER))
    expect(statusOf(abandoned[0])).toBe('success')
    expect(retry[0]).not.toBe(abandoned[0])

    // No step of the retry is reported done, so the modal opens on step 1...
    expect(statusOf(retry[0])).toBeUndefined()
    expect(statusOf(retry[1])).toBeUndefined()
    const transactions = asTransactions(retry)
    expect(getActiveTransaction(transactions, undefined).id).toBe(retry[0])

    // ...and the abandoned attempt's step can't advance it: its id is not one
    // of this attempt's, which is all `useAutoAdvanceTransaction` acts on.
    expect(transactions.some((tx) => tx.id === abandoned[0])).toBe(false)

    await runStepToSuccess(retry[0], wallet)
    expect(wallet.walletRequests()).toBe(2)
  })

  it('reports no step as done once the wallet switches accounts mid-flow', async () => {
    const wallet = createCountingWallet(SENDER)
    transactionManager.setConnectedAccount(SENDER)

    const ids = planIds(createFlowScope(SENDER))
    await runStepToSuccess(ids[0], wallet)
    expect(statusOf(ids[0])).toBe('success')

    transactionManager.setConnectedAccount(OTHER_ACCOUNT)

    ids.forEach((id) => {
      expect(statusOf(id)).toBeUndefined()
    })
  })
})
