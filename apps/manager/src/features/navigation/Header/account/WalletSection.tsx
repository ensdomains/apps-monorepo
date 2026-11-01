import { Trans, useLingui } from '@lingui/react/macro'
import { useSelector } from '@xstate/store-react'
import { ShieldAlert, ShieldCheck, WalletIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { match, P } from 'ts-pattern'
import { useAccount } from 'wagmi'
import { MSymbol } from '@/components/ui/material-symbol'
import { RevokeSessionsModal } from '@/features/wallet/components/RevokeSessionsModal'
import { useCopyFeedback } from '@/hooks/useCopyFeedback'
import { useSmartAccountContext } from '@/lib/smart-account'
import { truncateAddress } from '@/lib/utils'
import { useWalletDisconnect } from '@/lib/wallet'
import { backendAuthStore } from '@/utils/backend-client'
import { isFeatureEnabled } from '@/utils/feature-flags'
import { AccountMenuItemButton, AccountMenuItemStatus } from './AccountMenuItem'

type WalletSectionProps = {
  readonly onAction: () => void
}

export const WalletSection = ({ onAction }: WalletSectionProps) => {
  const { t } = useLingui()
  const {
    accountAddress,
    ownerAddress,
    isLoading,
    hasActiveSession,
    isEnablingSession,
    enableSession,
    isRevokingSession,
    revokeError,
    revokeErrorReason,
    revokeSession,
    isSessionAccessReset,
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

  // The one ENABLE signature. A decline leaves the row as is; a failure says why.
  const handleEnableSessions = async () => {
    const outcome = await enableSession()
    if (outcome.status === 'enabled') onAction()
    if (outcome.status === 'failed') toast.error(outcome.message)
  }

  return (
    <>
      {/* Show the user's wallet address, never the HCA (WEB-678). The live
          wagmi account comes first: the machine's ownerAddress can be stale
          for a render during a wallet switch. */}
      {match({
        walletAddress: connectedAddress ?? ownerAddress ?? accountAddress,
        isLoading,
      })
        .with({ walletAddress: P.nonNullable }, ({ walletAddress }) => (
          <AccountMenuItemButton
            onClick={() => copy(walletAddress)}
            prefix={
              <>
                <span className="flex group-hover:hidden group-focus-visible:hidden">
                  <MSymbol
                    className="ms-opsz-20"
                    symbol="account_balance_wallet"
                  />
                </span>
                <span className="hidden group-hover:flex group-focus-visible:flex">
                  <MSymbol className="ms-opsz-20" symbol="content_copy" />
                </span>
              </>
            }
            title={t`Copy wallet address`}
          >
            {copied ? (
              <Trans>Copied!</Trans>
            ) : (
              <span className="font-mono">
                {truncateAddress(walletAddress)}
              </span>
            )}
          </AccountMenuItemButton>
        ))
        .with({ isLoading: true }, () => (
          <AccountMenuItemStatus
            aria-busy="true"
            aria-live="polite"
            className="text-ens-quartz-400"
            prefix={
              <span className="size-3 animate-spin rounded-full border-2 border-ens-blue border-t-transparent" />
            }
          >
            <Trans>Deploying smart account…</Trans>
          </AccountMenuItemStatus>
        ))
        .otherwise(() => null)}

      {shouldShowSiweButton && (
        <AccountMenuItemButton
          className="text-ens-lapis-core"
          onClick={() => {
            backendAuthStore.trigger.resetModal()
            onAction()
          }}
          prefix={<WalletIcon className="size-5 text-ens-lapis-core" />}
        >
          <Trans>Verify wallet ownership</Trans>
        </AccountMenuItemButton>
      )}

      {/* Reset is offered without a local session too: a leaked session lives on
          another device, so a fresh browser is where its owner revokes it.
          Right after a reset there is nothing left to revoke until a new
          session is signed, so a second one would only spend gas. */}
      {accountAddress && !isFeatureEnabled('USE_EOA') && (
        <>
          <AccountMenuItemStatus
            className="text-ens-quartz-400"
            prefix={
              <MSymbol
                className="ms-opsz-20"
                symbol={hasActiveSession ? 'fingerprint' : 'flash_off'}
              />
            }
          >
            {hasActiveSession ? (
              <Trans>Smart sessions on</Trans>
            ) : (
              <Trans>Smart sessions off</Trans>
            )}
          </AccountMenuItemStatus>
          {!hasActiveSession && (
            <AccountMenuItemButton
              disabled={isEnablingSession}
              onClick={() => void handleEnableSessions()}
            >
              {isEnablingSession ? (
                <Trans>Enabling smart sessions…</Trans>
              ) : (
                <Trans>Enable smart sessions</Trans>
              )}
            </AccountMenuItemButton>
          )}
          <AccountMenuItemButton
            disabled={isRevokingSession || isSessionAccessReset}
            onClick={() => setIsRevokeOpen(true)}
            prefix={
              isSessionAccessReset ? (
                <ShieldCheck className="size-5" />
              ) : (
                <ShieldAlert className="size-5" />
              )
            }
          >
            {isSessionAccessReset ? (
              <Trans>Smart session access reset</Trans>
            ) : (
              <Trans>Reset smart session access</Trans>
            )}
          </AccountMenuItemButton>
        </>
      )}

      <RevokeSessionsModal
        errorMessage={revokeError}
        isRevoking={isRevokingSession}
        isUndeployed={revokeErrorReason === 'not-deployed'}
        onOpenChange={setIsRevokeOpen}
        onRevokeSessions={async (options) => {
          const revoked = await revokeSession(options)
          if (revoked) onAction()
          return revoked
        }}
        open={isRevokeOpen}
      />

      <AccountMenuItemButton
        onClick={() => void handleDisconnect()}
        prefix={
          isDisconnecting ? (
            <span className="size-4 animate-spin rounded-full border-2 border-ens-blue border-t-transparent" />
          ) : null
        }
      >
        <Trans>Disconnect</Trans>
      </AccountMenuItemButton>
    </>
  )
}
