import { useLogout, useModal } from '@getpara/react-sdk-lite'
import { useSelector } from '@xstate/store-react'
import { BookmarkCheckIcon, UnlinkIcon, WalletIcon } from 'lucide-react'
import { match } from 'ts-pattern'
import paraColorIcon from '@/assets/icons/para-color.svg'
import { Switch } from '@/components/ui/switch'
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
      {match(walletSource)
        .with('para-embedded', () => (
          <button
            className="flex items-center gap-2"
            onClick={() => openModal()}
            type="button"
          >
            <img
              alt="Para Logo"
              className="size-6 bg-[#FEF9F8] p-1"
              src={paraColorIcon}
            />
            <div className="flex flex-col items-start gap-1">
              <div className="font-medium text-[#232222] text-sm">
                Manage Para Wallet
              </div>
              <div className="truncate text-[#6B6B6B] text-xs leading-ens-normal">
                {truncateAddress(accountAddress)}
              </div>
            </div>
          </button>
        ))
        .with('external-wallet', () => (
          // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: Accessible via toggle
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
        <span className="text-[#232222] text-base leading-ens-tight">
          Disconnect
        </span>
      </button>
    </div>
  )
}
