import { TransactionRevertedError } from '@ens-apps/transaction-manager/errors/transaction.errors'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { err, ok, type Result } from 'neverthrow'
import { match, P } from 'ts-pattern'
import type { TransactionReceipt } from 'viem'

export class RevokeMigrationApprovalError extends TaggedError(
  'RevokeMigrationApprovalError',
)<{ cause: unknown }> {}

export const toRevokeMigrationApprovalError = (
  cause: unknown,
): RevokeMigrationApprovalError =>
  new RevokeMigrationApprovalError({
    cause,
    message: match(cause)
      .with(
        P.instanceOf(TransactionRevertedError),
        () => 'The revocation failed. Please try again.',
      )
      .with(P.instanceOf(Error), (error) => error.message)
      .otherwise(() => 'The revocation failed. Please try again.'),
  })

export const verifyMigrationApprovalRevocationReceipt = (
  receipt: Pick<TransactionReceipt, 'status'>,
): Result<void, RevokeMigrationApprovalError> =>
  receipt.status === 'success'
    ? ok(undefined)
    : err(
        new RevokeMigrationApprovalError({
          cause: receipt,
          message: 'The revocation failed. Please try again.',
        }),
      )
