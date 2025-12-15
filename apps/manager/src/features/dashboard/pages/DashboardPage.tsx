import { useAccount, useWallet } from '@getpara/react-sdk-lite'
import { useQuery } from '@tanstack/react-query'
import { useAtom } from '@xstate/store/react'
import { CircleAlert, X } from 'lucide-react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { DashboardSidebar } from '@/features/dashboard/components/DashboardSidebar'
import { DidYouKnowSection } from '@/features/dashboard/components/DidYouKnowSection'
import { FaqSection } from '@/features/dashboard/components/FaqSection'
import { NamesTable } from '@/features/dashboard/components/NamesTable'
import { PrimaryNameCard } from '@/features/dashboard/components/PrimaryNameCard'
import { parseAvatarQuery } from '@/features/profile/service/profileAvatar'
import { profileExpiryQuery } from '@/features/profile/service/profileExpiry'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { useSmartAccount } from '@/lib/smart-account'
import {
  dashboardUiStore,
  hasDismissedNewWalletBannerAtom,
} from './DashboardPage.store'

const formatAddress = (value?: string | null) =>
  value ? `${value.slice(0, 6)}...${value.slice(-4)}` : '—'

const NewWalletBanner = ({ onClose }: { onClose: () => void }) => {
  return (
    <div className="flex w-full items-start justify-between gap-3 rounded-[8px] border-[#0080bc] border-[0.4px] bg-[#e5f7ff] px-3 py-3 md:px-[14px] md:py-[16px]">
      <div className="flex items-start gap-2 md:gap-3">
        <div className="relative size-[14px] shrink-0">
          <CircleAlert className="size-full text-[#0080bc]" />
        </div>
        <div className="flex flex-col gap-1 md:gap-2">
          <p className="font-medium font-sans text-[#0080bc] text-[12px] leading-[18px] tracking-[0.24px] md:text-[14px] md:leading-[22px] md:tracking-[0.28px]">
            You have a new wallet.
          </p>
          <p className="font-sans text-[#5c5b5b] text-[11px] leading-[1.2] tracking-[0.11px] md:text-[12px] md:tracking-[0.12px]">
            You created a new wallet to put your name in. Go to Para.com to get
            your private keys.
          </p>
        </div>
      </div>
      <button
        type="button"
        className="shrink-0 text-[#b1b1b1] hover:text-[#8c8c8c]"
        aria-label="Close alert"
        onClick={onClose}
      >
        <X className="size-[11px]" />
      </button>
    </div>
  )
}

export const DashboardPage = () => {
  const account = useAccount()
  const { data: wallet } = useWallet()
  const { accountAddress: smartAccountAddress } = useSmartAccount({
    type: 'pimlico',
    accountType: 'hca',
  })
  const hasDismissedNewWalletBanner = useAtom(hasDismissedNewWalletBannerAtom)

  const eoaAddress = wallet?.address as Address | undefined
  const reverseAddress = (smartAccountAddress ?? eoaAddress) as
    | Address
    | undefined

  const { data: reverseName, isPending: isReverseNameLoading } = useQuery({
    ...profileReverseNameQuery(reverseAddress),
  })
  const { data: reverseRecords, isPending: isReverseRecordsLoading } = useQuery(
    {
      ...profileRecordsQuery(reverseName ?? ''),
      enabled: !!reverseName,
    },
  )
  const { data: reverseExpiry, isPending: isReverseExpiryLoading } = useQuery({
    ...profileExpiryQuery(reverseName ?? ''),
    enabled: !!reverseName,
  })

  const avatarRecord = reverseRecords?.texts.find(
    (text) => text.key === 'avatar',
  )?.value

  const { data: parsedAvatar, isPending: isAvatarPending } = useQuery({
    ...parseAvatarQuery(avatarRecord),
    enabled: !!avatarRecord,
  })

  const normalizedPrimaryName = wallet?.ensName?.toLowerCase()
  const primaryLabel = normalizedPrimaryName ?? null

  const defaultName = reverseName ?? wallet?.ensName ?? primaryLabel ?? null

  const registeredDate = null
  const expiryDate =
    reverseExpiry?.expiry != null
      ? new Date(Number(reverseExpiry.expiry) * 1000)
      : null
  const avatarUrl = parsedAvatar ?? wallet?.ensAvatar ?? null

  const isPrimaryLoading =
    isReverseNameLoading ||
    isReverseRecordsLoading ||
    isReverseExpiryLoading ||
    isAvatarPending

  const displayName =
    defaultName ?? formatAddress(smartAccountAddress ?? eoaAddress)
  const hasProfile = Boolean(defaultName)

  const handleDismissNewWalletBanner = () => {
    dashboardUiStore.trigger.dismissNewWalletBanner()
  }

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col items-start gap-4 px-4 py-6 md:flex-row md:gap-8 md:px-[58px] md:py-[40px]">
      <DashboardSidebar
        hasProfile={hasProfile}
        profileName={defaultName ?? ''}
      />
      <div className="min-w-0 flex-1 space-y-6 md:space-y-8">
        <div className="space-y-4 md:space-y-8">
          {match({
            connectionType: account.connectionType,
            dismissed: hasDismissedNewWalletBanner,
          })
            .with({ dismissed: false, connectionType: 'embedded' }, () => (
              <NewWalletBanner onClose={handleDismissNewWalletBanner} />
            ))
            .with({ dismissed: false, connectionType: 'both' }, () => (
              <NewWalletBanner onClose={handleDismissNewWalletBanner} />
            ))
            .otherwise(() => null)}
          <h1 className="font-serif text-[#232222] text-[28px] leading-[0.96] tracking-[0.28px] md:text-[40px] md:tracking-[0.4px]">
            Hello {displayName}
          </h1>
        </div>
        {(hasProfile || isPrimaryLoading) && (
          <PrimaryNameCard
            primaryName={defaultName}
            registeredDate={registeredDate}
            expiryDate={expiryDate}
            avatarUrl={avatarUrl}
            names={[]}
            primaryLabel={primaryLabel}
            isLoading={isPrimaryLoading}
          />
        )}
        <div className="rounded-[8px] border-[#dededf] border-[0.25px] bg-white px-4 py-6 md:px-[24px] md:py-[32px]">
          <div className="space-y-5">
            <NamesTable primaryLabel={primaryLabel} />
          </div>
        </div>
        <DidYouKnowSection />
        <FaqSection />
      </div>
    </div>
  )
}
