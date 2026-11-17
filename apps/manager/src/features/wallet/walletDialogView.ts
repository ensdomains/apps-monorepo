import { match } from 'ts-pattern'
import type { SmartAccountContextValue } from '@/lib/smart-account'
import type { ConnectDialogView, ConnectFlow } from '@/lib/wallet'

// A single view keeps the connect and standalone sign-in dialogs mutually exclusive.
export type WalletDialogView =
  | 'none'
  | 'choose-wallet'
  | 'sign-in-step'
  | 'standalone-sign-in'

type WalletDialogViewParams = {
  readonly connectFlow: ConnectFlow
  readonly isConnected: boolean
  /** Not signed in, and the user hasn't skipped signing in. */
  readonly isSignInNeeded: boolean
  readonly isAccountSettled: boolean
}

export const getWalletDialogView = ({
  connectFlow,
  isConnected,
  isSignInNeeded,
  isAccountSettled,
}: WalletDialogViewParams): WalletDialogView =>
  match(connectFlow)
    .returnType<WalletDialogView>()
    .with('choosing', () => 'choose-wallet')
    // WalletConnect's own QR modal is up.
    .with('pairing', () => 'none')
    .otherwise((flow) => {
      if (!isConnected || !isSignInNeeded) return 'none'
      // Shown at once, while the account prepares, so the dialog doesn't close.
      if (flow === 'signing-in') return 'sign-in-step'
      return isAccountSettled ? 'standalone-sign-in' : 'none'
    })

// Whether sign-in can stop waiting on the smart account: it is ready, or it failed. Null before the provider mounts; then we don't wait, so EOA-only isn't stuck.
export const isSmartAccountSettled = (
  smartAccount: Pick<
    SmartAccountContextValue,
    'isAccountReady' | 'error'
  > | null,
): boolean =>
  smartAccount === null || smartAccount.isAccountReady || !!smartAccount.error

// The connect dialog's own step for a view; the other views close it.
export const getConnectDialogView = (
  view: WalletDialogView,
): ConnectDialogView =>
  match(view)
    .returnType<ConnectDialogView>()
    .with('choose-wallet', () => 'choose-wallet')
    .with('sign-in-step', () => 'sign-in')
    .otherwise(() => 'closed')
