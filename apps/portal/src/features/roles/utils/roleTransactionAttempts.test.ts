/**
 * Regression cover for repeated role changes in a single session.
 *
 * A finished actor stays in the transaction manager so the modal can keep
 * rendering a completed step, which means a step named with a fixed id is
 * matched by the *previous* attempt's actor: the modal reads it as done and
 * the wallet is never asked. Every attempt therefore gets its own scope.
 */

import {
  createFlowScope,
  transactionManager,
} from '@ens-apps/transaction-manager'
import {
  createCountingWallet,
  resetTransactionManager,
  runStepToSuccess,
  type TestWallet,
} from '@ens-apps/transaction-manager/test-utils/transactionActor'
import type { Role } from '@ensdomains/ensjs/utils/v2'
import type { Address } from 'viem'
import { afterEach, describe, expect, it } from 'vitest'
import { getStatus } from '@/features/transaction-manager/utils/getStatus'
import { buildRoleTransactionDescriptors } from './buildRoleTransactionDescriptors'

const NAME = 'example.eth'
const SIGNER = '0x1111111111111111111111111111111111111111' as Address
const TARGET_USER = '0x2222222222222222222222222222222222222222' as Address

const PENDING_REMOVE = {
  account: TARGET_USER,
  roles: ['ROLE_SET_RESOLVER'] as readonly Role[],
}

const revokeDescriptor = (scope: ReturnType<typeof createFlowScope> | null) =>
  buildRoleTransactionDescriptors(null, PENDING_REMOVE, NAME, scope)[0]

const statusOf = (id: string) =>
  getStatus(id, transactionManager.getTransactions())

const runRevocation = async (
  wallet: TestWallet,
  scope: ReturnType<typeof createFlowScope> | null,
) => {
  const descriptor = revokeDescriptor(scope)
  await runStepToSuccess(descriptor.id, wallet)
  return descriptor
}

afterEach(() => {
  resetTransactionManager()
})

describe('repeated role revocations in one session', () => {
  it('asks the wallet a second time when the same revocation is run again', async () => {
    const wallet = createCountingWallet(SIGNER)

    const first = await runRevocation(wallet, createFlowScope(SIGNER))
    expect(wallet.walletRequests()).toBe(1)
    // The finished actor stays put — the modal reads it to render "Done".
    expect(statusOf(first.id)).toBe('success')

    // A second revocation builds a fresh scope, so its step is a different
    // actor even though the manager still holds the first one — nothing is
    // cleared, because the scope alone has to be enough.
    const second = revokeDescriptor(createFlowScope(SIGNER))
    expect(second.id).not.toBe(first.id)
    expect(statusOf(second.id)).toBeUndefined()

    await runStepToSuccess(second.id, wallet)
    expect(wallet.walletRequests()).toBe(2)
    expect(statusOf(second.id)).toBe('success')
  })

  it('would inherit the finished actor if the attempt were not scoped', async () => {
    // Why the scope is load-bearing: with a fixed id the second attempt reads
    // as already done, so no transaction is ever sent.
    const wallet = createCountingWallet(SIGNER)

    const first = await runRevocation(wallet, null)
    const second = revokeDescriptor(null)

    expect(second.id).toBe(first.id)
    expect(statusOf(second.id)).toBe('success')
    expect(wallet.walletRequests()).toBe(1)
  })

  it('scopes a grant and a revoke of the same attempt to separate ids', () => {
    const scope = createFlowScope(SIGNER)
    const descriptors = buildRoleTransactionDescriptors(
      {
        account: TARGET_USER,
        rolesToGrant: ['ROLE_RENEW'],
        rolesToRevoke: ['ROLE_UNREGISTER'],
      },
      null,
      NAME,
      scope,
    )

    expect(descriptors).toHaveLength(2)
    expect(descriptors[0].id).not.toBe(descriptors[1].id)
    // The base id still leads, so logs and matchers stay readable.
    expect(descriptors[0].id.startsWith('tx-grant-roles')).toBe(true)
    expect(descriptors[1].id.startsWith('tx-revoke-roles')).toBe(true)
  })
})
