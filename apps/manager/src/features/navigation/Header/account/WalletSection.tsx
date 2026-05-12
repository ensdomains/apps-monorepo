import { useLogout, useModal } from '@getpara/react-sdk-lite'
import { Trans } from '@lingui/react/macro'
import { useSelector } from '@xstate/store-react'
import { WalletIcon } from 'lucide-react'
import { match } from 'ts-pattern'
import paraColorIcon from '@/assets/icons/para-color.svg'
import { MSymbol } from '@/components/ui/material-symbol'
import { useCopyFeedback } from '@/hooks/useCopyFeedback'
import { useSmartAccountContext } from '@/lib/smart-account'
import { truncateAddress } from '@/lib/utils'
import { backendAuthStore } from '@/utils/backend-client'

type WalletSectionProps = {
  readonly onAction: () => void
}

export const WalletSection = ({ onAction }: WalletSectionProps) => {
  const { walletSource, accountAddress, isLoading } = useSmartAccountContext()
  const { copied, copy } = useCopyFeedback()
  const shouldShowSiweButton = useSelector(
    backendAuthStore,
    (state) =>
      state.context.authKey === undefined &&
      state.context.modalDismissed === true,
  )
  const { openModal } = useModal()
  const logout = useLogout()

  return (
    <div className="mb-3 space-y-4">
      {accountAddress ? (
        <button
          className="flex w-full items-center gap-2"
          onClick={() => copy(accountAddress)}
          type="button"
        >
          <MSymbol className="ms-opsz-20" symbol="account_balance_wallet" />
          <span className="font-[350] text-base text-ens-quartz-400">
            Address
          </span>
          <span className="text-sm leading-ens-tight">
            {copied ? <Trans>Copied!</Trans> : truncateAddress(accountAddress)}
          </span>
          <MSymbol className="ms-opsz-20" symbol="content_copy" />
        </button>
      ) : isLoading ? (
        <div
          aria-busy="true"
          aria-live="polite"
          className="flex w-full items-center gap-2"
        >
          <MSymbol className="ms-opsz-20" symbol="account_balance_wallet" />
          <span className="font-[350] text-base text-ens-quartz-400">
            Address
          </span>
          <span className="flex items-center gap-2 text-ens-quartz-400 text-sm leading-ens-tight">
            <span className="size-3 animate-spin rounded-full border-2 border-ens-blue border-t-transparent" />
            <Trans>Deploying smart account…</Trans>
          </span>
        </div>
      ) : null}

      {match(walletSource)
        .with('para-embedded', () => (
          <div className="flex items-center gap-2">
            <img
              alt="Para Logo"
              className="size-6 bg-[#FEF9F8] p-1"
              src={paraColorIcon}
            />
            <button
              className="text-ens-quartz-900 text-sm"
              onClick={() => openModal()}
              type="button"
            >
              <Trans>Manage Para Wallet</Trans>
            </button>
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

      <button
        className="flex w-full items-center gap-2 rounded-lg"
        onClick={() => {
          logout.logout()
          onAction()
        }}
        type="button"
      >
        {logout.isPending ? (
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
