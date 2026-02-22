import { useLogout, useModal } from '@getpara/react-sdk-lite'
import { useSelector } from '@xstate/store-react'
import {
  BookmarkCheckIcon,
  CheckIcon,
  CopyIcon,
  UnlinkIcon,
  WalletIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { match } from 'ts-pattern'
import paraColorIcon from '@/assets/icons/para-color.svg'
import { CopyToClipboard } from '@/components/atoms/CopyToClipboard'
import { Switch } from '@/components/ui/switch'
import { copyToClipboard } from '@/lib/clipboard'
import { useSmartAccountContext } from '@/lib/smart-account'
import { truncateAddress } from '@/lib/utils'
import { backendAuthStore } from '@/utils/backend-client'
import { tw } from '@/utils/tailwind'

interface WalletSectionProps {
  onAction: () => void
}

export const WalletSection = ({ onAction }: WalletSectionProps) => {
  const { isSessionClient, walletSource, accountAddress, openSessionModal } =
    useSmartAccountContext()

  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  const handleCopyAddress = async () => {
    if (!accountAddress) return
    await copyToClipboard(accountAddress)
    setCopied(true)
  }

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
      {accountAddress && (
        <button
          className="flex w-full items-center gap-2"
          onClick={handleCopyAddress}
          type="button"
        >
          {copied ? (
            <CheckIcon className="size-5 text-green-600" />
          ) : (
            <CopyIcon className="size-5 text-ens-lapis-core" />
          )}
          <div className="flex flex-col items-start">
            <span className="text-base text-ens-lapis-core leading-ens-tight">
              {copied ? 'Copied!' : 'Copy Address'}
            </span>
            <span className="text-muted-foreground text-xs leading-ens-normal">
              {truncateAddress(accountAddress)}
            </span>
          </div>
        </button>
      )}

      {match(walletSource)
        .with('para-embedded', () => (
          <div className="flex items-center gap-2">
            <img
              alt="Para Logo"
              className="size-6 bg-[#FEF9F8] p-1"
              src={paraColorIcon}
            />
            <div className="flex flex-col items-start gap-1">
              <button
                className="font-medium text-foreground text-sm"
                onClick={() => openModal()}
                type="button"
              >
                Manage Para Wallet
              </button>
              <div className="truncate text-muted-foreground text-xs leading-ens-normal">
                {truncateAddress(accountAddress)}
              </div>
            </div>
          </div>
        ))
        .with('external-wallet', () => (
          <>
            <div className="flex items-center gap-2">
              <WalletIcon className="size-5 text-muted-foreground" />
              <div className="flex items-center gap-1 text-muted-foreground text-sm">
                <span className="truncate">
                  {truncateAddress(accountAddress)}
                </span>
                <CopyToClipboard
                  className="size-3.5 text-muted-foreground"
                  value={accountAddress}
                />
              </div>
            </div>
            {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: Accessible via toggle */}
            <div
              className={tw(
                'flex items-center gap-2',
                !isSessionClient && 'cursor-pointer',
              )}
              onClick={() => {
                if (!isSessionClient) {
                  openSessionModal()
                }

                onAction?.()
              }}
            >
              <BookmarkCheckIcon className="size-5 text-ens-lapis-core" />
              <div className="text-base text-ens-lapis-surface">
                {isSessionClient
                  ? 'Smart Session Active'
                  : 'Smart Session Disabled'}
              </div>
              <Switch
                checked={isSessionClient}
                className="ml-auto"
                disabled={isSessionClient}
                onCheckedChange={() => {
                  if (!isSessionClient) {
                    openSessionModal()
                  }

                  onAction?.()
                }}
              />
            </div>
          </>
        ))
        .otherwise(() => null)}

      {shouldShowSiweButton && (
        <button
          className="flex w-full items-center gap-2"
          onClick={() => {
            backendAuthStore.trigger.resetModal()

            onAction?.()
          }}
          type="button"
        >
          <WalletIcon className="size-5 text-ens-lapis-core" />
          <span className="text-base text-ens-lapis-core leading-ens-tight">
            Verify wallet ownership
          </span>
        </button>
      )}

      <button
        className="flex w-full items-center gap-2 rounded-lg"
        onClick={() => {
          logout.logout()
          onAction?.()
        }}
        type="button"
      >
        {logout.isPending ? (
          <div className="size-4 animate-spin rounded-full border-2 border-ens-blue border-t-transparent" />
        ) : (
          <UnlinkIcon className="size-5" />
        )}
        <span className="text-base text-foreground leading-ens-tight">
          Disconnect
        </span>
      </button>
    </div>
  )
}
