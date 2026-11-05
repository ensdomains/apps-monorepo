import { isWalletDeclineError } from '@ens-apps/transaction-manager/helpers/wallet-errors.helpers'
import { match, P } from 'ts-pattern'
import {
  FundsHeldForRegistrationError,
  formatLeftoverFunds,
  type WithdrawLeftoverFundsResult,
} from '@/features/wallet/service/leftoverFunds'

/** What the user is told once the refund after a registration settles. */
export type LeftoverRefundNotice =
  | { readonly kind: 'none' }
  | { readonly kind: 'returned'; readonly amount: string }
  | { readonly kind: 'held'; readonly registrationName: string }
  | { readonly kind: 'declined' }
  | { readonly kind: 'failed' }

/** Declined or failed leaves the funds in the smart account for a manual withdrawal. */
export const resolveLeftoverRefundNotice = (
  settled:
    | { readonly result: WithdrawLeftoverFundsResult }
    | { readonly error: unknown },
): LeftoverRefundNotice =>
  match(settled)
    .returnType<LeftoverRefundNotice>()
    .with({ result: { withdrawn: [] } }, () => ({ kind: 'none' }))
    .with({ result: P.select() }, ({ withdrawn }) => ({
      kind: 'returned',
      amount: formatLeftoverFunds(withdrawn),
    }))
    .with(
      { error: P.instanceOf(FundsHeldForRegistrationError) },
      ({ error }) => ({
        kind: 'held',
        registrationName: error.registrationName,
      }),
    )
    .with({ error: P.when(isWalletDeclineError) }, () => ({ kind: 'declined' }))
    .otherwise(() => ({ kind: 'failed' }))
