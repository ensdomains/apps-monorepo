import { CircleAlert, X } from 'lucide-react'
import { DashboardSidebar } from '@/features/dashboard/components/DashboardSidebar'
import { DidYouKnowSection } from '@/features/dashboard/components/DidYouKnowSection'
import { FaqSection } from '@/features/dashboard/components/FaqSection'
import { NamesTable } from '@/features/dashboard/components/NamesTable'
import { PrimaryNameCard } from '@/features/dashboard/components/PrimaryNameCard'
import {
  useDashboardFavoritesQuery,
  useDashboardHeaderQuery,
  useDashboardNamesQuery,
} from '@/features/dashboard/service/hooks'

export const DashboardPage = () => {
  const { data: header } = useDashboardHeaderQuery()
  const { data: names } = useDashboardNamesQuery()
  const { data: favorites } = useDashboardFavoritesQuery()

  const displayName = header.primaryName
  const hasProfile = Boolean(header.primaryName)

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col items-start gap-4 px-4 py-6 md:flex-row md:gap-8 md:px-[58px] md:py-[40px]">
      <DashboardSidebar
        hasProfile={hasProfile}
        profileName={header.primaryName}
      />
      <div className="min-w-0 flex-1 space-y-6 md:space-y-8">
        <div className="space-y-4 md:space-y-8">
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
                  You created a new wallet to put your name in. Go to Para.com
                  to get your private keys.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="shrink-0 text-[#b1b1b1] hover:text-[#8c8c8c]"
              aria-label="Close alert"
            >
              <X className="size-[11px]" />
            </button>
          </div>
          <h1 className="font-serif text-[#232222] text-[28px] leading-[0.96] tracking-[0.28px] md:text-[40px] md:tracking-[0.4px]">
            Hello {displayName}
          </h1>
        </div>
        <PrimaryNameCard
          primaryName={header.primaryName}
          address={header.address}
          registeredDate={header.registeredDate}
          expiryDate={header.expiryDate}
          avatarUrl={header.avatarUrl}
          names={names}
        />
        <div className="rounded-[8px] border-[#dededf] border-[0.25px] bg-white px-4 py-6 md:px-[24px] md:py-[32px]">
          <div className="space-y-5">
            <NamesTable favorites={favorites} />
          </div>
        </div>
        <DidYouKnowSection />
        <FaqSection />
      </div>
    </div>
  )
}
