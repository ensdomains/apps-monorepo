import type { Signer } from '@ens-apps/transaction-manager'

/** How a renewal is paid: an owner-signed HCA intent, or wallet transactions. */
export type RenewalPaymentRoute = 'intent' | 'wallet'

/**
 * The route the account context's signer selects, or `null` while it is not
 * ready. A smart account renews by intent; only EOA-only mode, whose signer is
 * the wallet itself, takes the wallet route. Never fall back to the wallet
 * while the HCA signer initializes: that route makes the user pay gas.
 */
export const getRenewalPaymentRoute = (
  signer: Signer | null | undefined,
): RenewalPaymentRoute | null => {
  if (signer?.type === 'rhinestone') return 'intent'
  if (signer?.type === 'eoa') return 'wallet'
  return null
}
