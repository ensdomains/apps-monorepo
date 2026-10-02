import {
  type FlowScope,
  scopeTransactionId,
} from '@ens-apps/transaction-manager'
import type { TransferStepKind } from './buildTransferPlan'

/**
 * Names one step of one transfer attempt.
 *
 * The name and the step alone are not enough: a finished actor stays in the
 * transaction manager so the modal can keep rendering a completed step, so an
 * attempt abandoned partway leaves a `success` actor under exactly the id the
 * next attempt would use. The modal would then show that step as done, skip
 * it, and move straight to the one after it. `scope` pins the id to a single
 * attempt and to the wallet running it.
 */
export const transferStepId = (
  name: string,
  step: TransferStepKind,
  scope: FlowScope | null,
): string => scopeTransactionId(`transfer-${name}-${step}`, scope)
