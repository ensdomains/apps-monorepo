import type { Signer } from '@ens-apps/transaction-manager'
import type { WalletClient } from 'viem'
import type { Connector } from 'wagmi'

/** How a renewal is paid: an owner-signed HCA intent, or wallet transactions. */
export type RenewalPaymentRoute = 'intent' | 'wallet'

/**
 * The route a renewal signer selects, or `null` while it is not ready. A smart
 * account renews by intent; EOA-only mode and a Safe{Wallet}, whose signer is
 * the wallet itself, take the wallet route. Never fall back to the wallet
 * while the HCA signer initializes: that route makes the user pay gas.
 */
export const getRenewalPaymentRoute = (
  signer: Signer | null | undefined,
): RenewalPaymentRoute | null => {
  if (signer?.type === 'rhinestone') return 'intent'
  if (signer?.type === 'eoa') return 'wallet'
  return null
}

/**
 * The signer a renewal sends with, `null` until the Safe check settles. A Safe
 * can't sign for the HCA, so it renews from the wallet with its connector.
 */
export const resolveRenewalSigner = ({
  signer,
  walletClient,
  connector,
  isSafeWallet,
}: {
  readonly signer: Signer | null
  readonly walletClient: WalletClient | null
  readonly connector: Connector | undefined
  readonly isSafeWallet: boolean | undefined
}): Signer | null => {
  if (isSafeWallet === undefined) return null
  if (!isSafeWallet) return signer
  return walletClient
    ? { type: 'eoa', walletClient, walletId: connector?.id, connector }
    : null
}
