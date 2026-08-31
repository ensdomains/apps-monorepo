import { Trans } from '@lingui/react/macro'
import { useSelector } from '@xstate/store-react'
import { ShieldOff, WalletIcon } from 'lucide-react'
import { useState } from 'react'
import { match, P } from 'ts-pattern'
import { useAccount } from 'wagmi'
import { MSymbol } from '@/components/ui/material-symbol'
import { RevokeSessionsModal } from '@/features/wallet/components/RevokeSessionsModal'
import { useCopyFeedback } from '@/hooks/useCopyFeedback'
import { useSmartAccountContext } from '@/lib/smart-account'
import { truncateAddress } from '@/lib/utils'
import { useWalletDisconnect } from '@/lib/wallet'
import { backendAuthStore } from '@/utils/backend-client'

type WalletSectionProps = {
  readonly onAction: () => void
}

export const WalletSection = ({ onAction }: WalletSectionProps) => {
  const {
    accountAddress,
    ownerAddress,
    isLoading,
    hasActiveSession,
    isRevokingSession,
    revokeError,
    revokeErrorReason,
    revokeSession,
    forgetLocalSession,
  } = useSmartAccountContext()
  const [isRevokeOpen, setIsRevokeOpen] = useState(false)
  const { address: connectedAddress } = useAccount()
  const { copied, copy } = useCopyFeedback()
  const shouldShowSiweButton = useSelector(
    backendAuthStore,
    (state) =>
      state.context.authKey === undefined &&
      state.context.modalDismissed === true,
  )
  const { disconnect, isDisconnecting } = useWalletDisconnect()

  const handleDisconnect = async () => {
    await disconnect()
    onAction()
  }

  return (
    <div className="mb-3 space-y-4">
      {/* Show the user's wallet address, never the HCA (WEB-678). The live
          wagmi account comes first: the machine's ownerAddress can be stale
          for a render during a wallet switch. */}
      {match({
        walletAddress: connectedAddress ?? ownerAddress ?? accountAddress,
        isLoading,
      })
        .with({ walletAddress: P.nonNullable }, ({ walletAddress }) => (
          <button
            className="flex w-full items-center gap-2"
            onClick={() => copy(walletAddress)}
            type="button"
          >
            <MSymbol className="ms-opsz-20" symbol="account_balance_wallet" />
            <span className="font-[350] text-base text-ens-quartz-400">
              <Trans>Address</Trans>
            </span>
            <span className="text-sm leading-ens-tight">
              {copied ? <Trans>Copied!</Trans> : truncateAddress(walletAddress)}
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

      {/* Only meaningful with a session to kill. Disconnect deliberately keeps
          sessions alive for a prompt-free reconnect, so this is the only way to
          actually end one early — and unlike the rest of the HCA flow it is a
          gas-paying owner transaction, hence the confirm step. */}
      {hasActiveSession && (
        <button
          className="flex w-full items-center gap-2 rounded-lg"
          onClick={() => setIsRevokeOpen(true)}
          type="button"
        >
          <ShieldOff className="size-5 text-ens-quartz-900" />
          <span className="text-ens-quartz-900 text-sm">
            <Trans>Revoke smart sessions</Trans>
          </span>
        </button>
      )}

      <RevokeSessionsModal
        errorMessage={revokeError}
        isRevoking={isRevokingSession}
        isUndeployed={revokeErrorReason === 'not-deployed'}
        onForgetLocalSession={() => {
          forgetLocalSession()
          onAction()
        }}
        onOpenChange={setIsRevokeOpen}
        onRevokeSessions={async () => {
          const revoked = await revokeSession()
          if (revoked) onAction()
          return revoked
        }}
        open={isRevokeOpen}
        smartAccountAddress={accountAddress ?? undefined}
      />

      <button
        className="flex w-full items-center gap-2 rounded-lg"
        onClick={() => void handleDisconnect()}
        type="button"
      >
        {isDisconnecting ? (
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
