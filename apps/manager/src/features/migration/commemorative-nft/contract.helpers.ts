import { TransactionRevertedError } from '@ens-apps/transaction-manager/errors/transaction.errors'
import { err, ok, type Result } from 'neverthrow'
import { match } from 'ts-pattern'
import type { Hex, TransactionReceipt } from 'viem'
import type { CommemorativeNftClaimReceiptResult } from './contract'

export type CommemorativeNftClaimSettlement = {
  readonly kind: 'direct' | 'safe'
  readonly receipt: Pick<
    TransactionReceipt,
    'status' | 'transactionHash' | 'blockNumber'
  >
}

export const getHistoricalCommemorativeNftSafeSettlement = (params: {
  readonly isSuccess: boolean
  readonly receipt: CommemorativeNftClaimSettlement['receipt']
  readonly safeTxHash: Hex
}): Result<CommemorativeNftClaimSettlement, TransactionRevertedError> =>
  params.isSuccess
    ? ok({ receipt: params.receipt, kind: 'safe' })
    : err(
        new TransactionRevertedError(
          `Safe transaction ${params.safeTxHash} failed (tx ${params.receipt.transactionHash})`,
        ),
      )

export const getCommemorativeNftReceiptDecision = (params: {
  readonly settlement: CommemorativeNftClaimSettlement
  readonly replacementReason?: 'cancelled' | 'replaced' | 'repriced'
}): 'cancelled' | 'replaced' | 'reverted' | 'verify' =>
  match(params)
    .returnType<'cancelled' | 'replaced' | 'reverted' | 'verify'>()
    .with(
      { settlement: { kind: 'direct' }, replacementReason: 'cancelled' },
      () => 'cancelled',
    )
    .with(
      { settlement: { kind: 'direct' }, replacementReason: 'replaced' },
      () => 'replaced',
    )
    .with({ settlement: { receipt: { status: 'reverted' } } }, () => 'reverted')
    .otherwise(() => 'verify')

export const getVerifiedCommemorativeNftClaimOutcome = (params: {
  readonly settlement: CommemorativeNftClaimSettlement
  readonly submittedHash: Hex
  readonly hasClaimed: boolean
}): CommemorativeNftClaimReceiptResult => ({
  status: params.hasClaimed ? 'confirmed' : 'pending',
  // An uncertain Safe claim must retain the safeTxHash. The carrying
  // transaction cannot pass the ordinary owner-to-NFT identity check.
  hash:
    params.settlement.kind === 'safe' && !params.hasClaimed
      ? params.submittedHash
      : params.settlement.receipt.transactionHash,
})

export const getFailedCommemorativeNftClaimOutcome = (params: {
  readonly cause: unknown
  readonly hash: Hex
}): CommemorativeNftClaimReceiptResult => ({
  status:
    params.cause instanceof TransactionRevertedError ? 'reverted' : 'pending',
  hash: params.hash,
})
