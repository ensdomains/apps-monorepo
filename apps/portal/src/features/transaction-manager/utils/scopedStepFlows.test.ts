/**
 * The fixed ids the single-step flows used to hard-code.
 *
 * A finished actor stays in the transaction manager so the modal can keep
 * rendering a completed step, so a step named with one of these is answered by
 * the *previous* attempt's actor: the modal renders "Done", its button fires
 * `onDone`, `onStart` is never called, and the write is never sent.
 * `TransactionModal.onOpenChange` clears only on error and a route change only
 * closes it, so an attempt abandoned mid-flight leaves that actor behind.
 *
 * Every one of these is now built through `scopeTransactionId` at its flow. This
 * file pins the id shapes so a flow that drops back to a bare literal is a
 * visible diff against this list rather than a silent behaviour change, and it
 * exercises the scoping guarantee once for the whole table.
 */

import {
  createFlowScope,
  scopeTransactionId,
  transactionManager,
} from '@ens-apps/transaction-manager'
import {
  createCountingWallet,
  resetTransactionManager,
  runStepToSuccess,
} from '@ens-apps/transaction-manager/test-utils/transactionActor'
import type { Address } from 'viem'
import { afterEach, describe, expect, it } from 'vitest'
import { getStatus } from '@/features/transaction-manager/utils/getStatus'

const SIGNER = '0x1111111111111111111111111111111111111111' as Address
const NAME = 'example.eth'

const statusOf = (id: string) =>
  getStatus(id, transactionManager.getTransactions())

afterEach(() => {
  resetTransactionManager()
})

const FLOWS = [
  'tx-save-resolver-records',
  'tx-create-ens-subname',
  `tx-delete-ens-subname-a.sub.eth`,
  'tx-burn-fuses',
  'tx-create-link',
  'tx-unlink',
  'tx-deploy-permissioned-resolver',
  'tx-change-resolver',
  'tx-deploy-subregistry',
  'tx-set-subregistry',
  'tx-update-reverse-name',
  'tx-set-primary-name',
  'tx-set-addr-60',
  'tx-forward-set-primary-name',
  `reclaim-manager-${NAME}`,
  `renewal-renew-${NAME}`,
  `dns-import-approve-${NAME}`,
  `dns-import-claim-${NAME}`,
  `dns-sync-manager-${NAME}`,
]

describe.each(FLOWS)('%s', (baseId) => {
  it('is answerable by its own attempt only', async () => {
    const wallet = createCountingWallet(SIGNER)

    const first = scopeTransactionId(baseId, createFlowScope(SIGNER))
    await runStepToSuccess(first, wallet)
    expect(wallet.walletRequests()).toBe(1)
    expect(statusOf(first)).toBe('success')

    // Nothing is cleared between attempts, so the scope alone is what stops the
    // finished actor from satisfying the next one.
    const second = scopeTransactionId(baseId, createFlowScope(SIGNER))
    expect(second).not.toBe(first)
    expect(statusOf(second)).toBeUndefined()

    await runStepToSuccess(second, wallet)
    expect(wallet.walletRequests()).toBe(2)
  })

  it('is unsendable a second time while unscoped', async () => {
    // The behaviour the scope removes: the modal finds the previous attempt's
    // finished actor, renders "Done", and never reaches `onStart`.
    const wallet = createCountingWallet(SIGNER)

    await runStepToSuccess(baseId, wallet)
    expect(statusOf(baseId)).toBe('success')

    if (statusOf(baseId) === undefined) await runStepToSuccess(baseId, wallet)
    expect(wallet.walletRequests()).toBe(1)
  })
})

describe('a chained flow', () => {
  it('keeps its steps apart, and apart from the next attempt', async () => {
    // `SubregistryConfigurator` runs deploy → set. An abandoned run must not
    // leave the deploy behind in a way that lets the next attempt skip it.
    const wallet = createCountingWallet(SIGNER)
    const first = createFlowScope(SIGNER)

    const deploy = scopeTransactionId('tx-deploy-subregistry', first)
    const set = scopeTransactionId('tx-set-subregistry', first)
    expect(deploy).not.toBe(set)

    await runStepToSuccess(deploy, wallet)
    expect(statusOf(deploy)).toBe('success')

    const next = scopeTransactionId(
      'tx-deploy-subregistry',
      createFlowScope(SIGNER),
    )
    expect(statusOf(next)).toBeUndefined()
    await runStepToSuccess(next, wallet)

    expect(wallet.walletRequests()).toBe(2)
    expect(statusOf(set)).toBeUndefined()
  })
})

describe('an account switch', () => {
  it('does not let one wallet’s receipt answer for another’s attempt', async () => {
    const other = '0x2222222222222222222222222222222222222222' as Address
    const wallet = createCountingWallet(SIGNER)

    const mine = scopeTransactionId(
      'tx-save-resolver-records',
      createFlowScope(SIGNER),
    )
    await runStepToSuccess(mine, wallet)

    const theirs = scopeTransactionId(
      'tx-save-resolver-records',
      createFlowScope(other),
    )
    expect(theirs).not.toBe(mine)
    expect(statusOf(theirs)).toBeUndefined()
  })
})
