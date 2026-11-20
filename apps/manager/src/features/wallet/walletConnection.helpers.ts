import type { GetConnectionReturnType } from '@wagmi/core'
import { match } from 'ts-pattern'
import type { SmartAccountContextValue } from '@/lib/smart-account'
import {
  type ConnectionOutcome,
  WALLETCONNECT_ID,
} from '@/lib/wallet/stacks/custom/connect.helpers'

export type WalletDialogStep =
  | 'closed'
  | 'wallets'
  | 'pairing'
  | 'signIn'
  | 'session'

export const isSmartAccountSettled = (
  account: Pick<SmartAccountContextValue, 'isAccountReady' | 'error'> | null,
): boolean =>
  account === null || account.isAccountReady || Boolean(account.error)

type WalletConnection = Pick<
  GetConnectionReturnType,
  'status' | 'connector' | 'address'
>

export const didWalletChange = (
  current: WalletConnection,
  previous: WalletConnection,
): boolean => {
  if (current.status === 'disconnected') return previous.connector !== undefined
  return (
    current.status === 'connected' &&
    (previous.status === 'reconnecting' ||
      current.connector?.uid !== previous.connector?.uid ||
      current.address !== previous.address)
  )
}

export const getConnectedDialogStep = ({
  step,
  isOwnedConnection,
  isReconnected,
}: {
  readonly step: WalletDialogStep
  readonly isOwnedConnection: boolean
  readonly isReconnected: boolean
}): WalletDialogStep =>
  step !== 'closed' && isOwnedConnection && !isReconnected ? 'signIn' : 'closed'

export const getConnectionResultDialogStep = (
  step: WalletDialogStep,
  outcome: ConnectionOutcome,
): WalletDialogStep =>
  match(outcome)
    .returnType<WalletDialogStep>()
    .with({ status: 'connected' }, () =>
      step === 'closed' ? 'closed' : 'signIn',
    )
    .with({ status: 'cancelled' }, () => (step === 'pairing' ? 'closed' : step))
    .with({ status: 'failed' }, () => (step === 'pairing' ? 'wallets' : step))
    .exhaustive()

export const getConnectionError = (
  outcome: ConnectionOutcome | undefined,
  connectorId: string | undefined,
): string | undefined =>
  outcome?.status === 'failed' ||
  (outcome?.status === 'cancelled' && connectorId !== WALLETCONNECT_ID)
    ? outcome.message
    : undefined

export const shouldShowSignIn = ({
  step,
  isConnected,
  isSignInNeeded,
  isAccountSettled,
}: {
  readonly step: WalletDialogStep
  readonly isConnected: boolean
  readonly isSignInNeeded: boolean
  readonly isAccountSettled: boolean
}): boolean =>
  isConnected &&
  isSignInNeeded &&
  (step === 'signIn' || step === 'session' || isAccountSettled)
