import type { RhinestoneTransactionRequest } from '@ens-apps/transaction-manager'

type IntentFeeParams = Pick<
  RhinestoneTransactionRequest['rhinestoneParams'],
  'sponsored' | 'feeAsset'
>

const USER_PAID: IntentFeeParams = {
  sponsored: { gas: false, bridging: false, swaps: false },
  feeAsset: 'USDC',
}

/**
 * Fee shape for one-off HCA intents. We do not subsidize: the HCA pays in
 * USDC unless a test environment opts into sponsorship explicitly.
 */
export const intentFeeParams = (): IntentFeeParams =>
  import.meta.env.VITE_ENABLE_TX_SPONSORSHIP === 'true'
    ? { sponsored: true }
    : USER_PAID
