import { Trans } from '@lingui/react/macro'
import { useSelector } from '@xstate/store-react'
import { WalletIcon } from 'lucide-react'
import { match, P } from 'ts-pattern'
import { useConnections } from 'wagmi'
import { MSymbol } from '@/components/ui/material-symbol'
import { useCopyFeedback } from '@/hooks/useCopyFeedback'
import { usePrivySession } from '@/lib/privy/usePrivySession'
import { useSmartAccountContext } from '@/lib/smart-account'
import { truncateAddress } from '@/lib/utils'
import { useSignOut } from '@/lib/wallet'
import { backendAuthStore } from '@/utils/backend-client'

type WalletSectionProps = {
  readonly onAction: () => void
}

export const WalletSection = ({ onAction }: WalletSectionProps) => {
  const { accountAddress, isLoading } = useSmartAccountContext()
  const { copied, copy } = useCopyFeedback()
  const shouldShowSiweButton = useSelector(
    backendAuthStore,
    (state) =>
      state.context.authKey === undefined &&
      state.context.modalDismissed === true,
  )
  const { exportWallet } = usePrivySession()
  const { signOut, isSigningOut } = useSignOut()
  const connections = useConnections()

  // Key export only applies to the Privy embedded wallet (an external wallet is
  // already self-custodial). Sign-out itself flushes both stores regardless.
  const isPrivySession = connections.some((c) => c.connector.id === 'privy')

  return (
    <div className="mb-3 space-y-4">
      {match({ accountAddress, isLoading })
        .with({ accountAddress: P.nonNullable }, ({ accountAddress }) => (
          <button
            className="flex w-full items-center gap-2"
            onClick={() => copy(accountAddress)}
            type="button"
          >
            <MSymbol className="ms-opsz-20" symbol="account_balance_wallet" />
            <span className="font-[350] text-base text-ens-quartz-400">
              <Trans>Address</Trans>
            </span>
            <span className="text-sm leading-ens-tight">
              {copied ? (
                <Trans>Copied!</Trans>
              ) : (
                truncateAddress(accountAddress)
              )}
            </span>
            <MSymbol className="ms-opsz-20" symbol="content_copy" />
          </button>
        ))
        .with({ isLoading: true }, () => (
          <div
            aria-busy="true"
            aria-live="polite"
            className="flex w-full items-center gap-2"
          >
            <MSymbol className="ms-opsz-20" symbol="account_balance_wallet" />
            <span className="font-[350] text-base text-ens-quartz-400">
              <Trans>Address</Trans>
            </span>
            <span className="flex items-center gap-2 text-ens-quartz-400 text-sm leading-ens-tight">
              <span className="size-3 animate-spin rounded-full border-2 border-ens-blue border-t-transparent" />
              <Trans>Deploying smart account…</Trans>
            </span>
          </div>
        ))
        .otherwise(() => null)}

      {shouldShowSiweButton && (
        <button
          className="flex w-full items-center gap-2"
          onClick={() => {
            backendAuthStore.trigger.resetModal()
            onAction()
          }}
          type="button"
        >
          <WalletIcon className="size-5 text-ens-lapis-core" />
          <span className="text-base text-ens-lapis-core leading-ens-tight">
            <Trans>Verify wallet ownership</Trans>
          </span>
        </button>
      )}

      {isPrivySession && (
        <button
          className="flex w-full items-center gap-2 rounded-lg"
          onClick={() => {
            void exportWallet()
            onAction()
          }}
          type="button"
        >
          <MSymbol className="ms-opsz-20" symbol="key" />
          <span className="text-ens-quartz-900 text-sm">
            <Trans>Export private key</Trans>
          </span>
        </button>
      )}

      <button
        className="flex w-full items-center gap-2 rounded-lg"
        onClick={() => {
          void signOut()
          onAction()
        }}
        type="button"
      >
        {isSigningOut ? (
          <div className="size-4 animate-spin rounded-full border-2 border-ens-blue border-t-transparent" />
        ) : (
          <MSymbol className="ms-opsz-20" symbol="logout" />
        )}
        <span className="text-ens-quartz-900 text-sm">
          <Trans>Disconnect</Trans>
        </span>
      </button>
    </div>
  )
}
