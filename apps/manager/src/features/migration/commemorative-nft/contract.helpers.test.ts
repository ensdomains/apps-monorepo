import { TransactionRevertedError } from '@ens-apps/transaction-manager/errors/transaction.errors'
import type { Hex } from 'viem'
import { assert, describe, expect, it } from 'vitest'
import {
  type CommemorativeNftClaimSettlement,
  getCommemorativeNftReceiptDecision,
  getFailedCommemorativeNftClaimOutcome,
  getHistoricalCommemorativeNftSafeSettlement,
  getVerifiedCommemorativeNftClaimOutcome,
} from './contract.helpers'

const submittedHash: Hex = `0x${'a'.repeat(64)}`
const executionHash: Hex = `0x${'b'.repeat(64)}`
const receipt = {
  status: 'success',
  transactionHash: executionHash,
  blockNumber: 42n,
} satisfies CommemorativeNftClaimSettlement['receipt']

describe('commemorative NFT settlement decisions', () => {
  it('keeps a historical Safe inner failure distinct from a successful carrying receipt', () => {
    const result = getHistoricalCommemorativeNftSafeSettlement({
      receipt,
      isSuccess: false,
      safeTxHash: submittedHash,
    })
    assert(result.isErr())
    expect(result.error).toBeInstanceOf(TransactionRevertedError)
  })

  it('keeps historical Safe success on the Safe verification path', () => {
    const result = getHistoricalCommemorativeNftSafeSettlement({
      receipt,
      isSuccess: true,
      safeTxHash: submittedHash,
    })
    assert(result.isOk())
    expect(result.value).toEqual({ kind: 'safe', receipt })
  })

  it.each([
    { kind: 'direct', replacementReason: 'cancelled', expected: 'cancelled' },
    { kind: 'direct', replacementReason: 'replaced', expected: 'replaced' },
    { kind: 'direct', replacementReason: 'repriced', expected: 'verify' },
    { kind: 'safe', replacementReason: 'cancelled', expected: 'verify' },
  ] satisfies readonly {
    readonly kind: CommemorativeNftClaimSettlement['kind']
    readonly replacementReason: 'cancelled' | 'replaced' | 'repriced'
    readonly expected: string
  }[])(
    'uses the $kind settlement when replacement is $replacementReason',
    ({ kind, replacementReason, expected }) => {
      expect(
        getCommemorativeNftReceiptDecision({
          settlement: { kind, receipt },
          replacementReason,
        }),
      ).toBe(expected)
    },
  )

  it('does not verify a reverted carrying transaction', () => {
    expect(
      getCommemorativeNftReceiptDecision({
        settlement: {
          kind: 'safe',
          receipt: { ...receipt, status: 'reverted' },
        },
      }),
    ).toBe('reverted')
  })

  it.each([
    { kind: 'safe', hasClaimed: false, status: 'pending', hash: submittedHash },
    {
      kind: 'safe',
      hasClaimed: true,
      status: 'confirmed',
      hash: executionHash,
    },
    {
      kind: 'direct',
      hasClaimed: false,
      status: 'pending',
      hash: executionHash,
    },
  ] satisfies readonly {
    readonly kind: CommemorativeNftClaimSettlement['kind']
    readonly hasClaimed: boolean
    readonly status: string
    readonly hash: Hex
  }[])(
    'retains the appropriate hash for $kind, claimed=$hasClaimed',
    ({ kind, hasClaimed, status, hash }) => {
      expect(
        getVerifiedCommemorativeNftClaimOutcome({
          settlement: { kind, receipt },
          submittedHash,
          hasClaimed,
        }),
      ).toEqual({ status, hash })
    },
  )

  it.each([
    { cause: new Error('RPC unavailable'), status: 'pending' },
    { cause: new Error('execution reverted'), status: 'pending' },
    {
      cause: new TransactionRevertedError('Safe execution failed'),
      status: 'reverted',
    },
  ])('treats $cause as $status', ({ cause, status }) => {
    expect(
      getFailedCommemorativeNftClaimOutcome({ cause, hash: submittedHash }),
    ).toEqual({ status, hash: submittedHash })
  })
})
