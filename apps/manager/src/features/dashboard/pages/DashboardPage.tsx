import { CircleAlert, X } from 'lucide-react'
import { DashboardSidebar } from '@/features/dashboard/components/DashboardSidebar'
import { DidYouKnowSection } from '@/features/dashboard/components/DidYouKnowSection'
import { FaqSection } from '@/features/dashboard/components/FaqSection'
import { MyNamesCard } from '@/features/dashboard/components/NamesTable'
import { PrimaryNameCard } from '@/features/dashboard/components/PrimaryNameCard'
import {
  MOCK_DASHBOARD_HEADER,
  MOCK_DASHBOARD_NAMES,
} from '@/features/dashboard/MOCK'

export const DashboardPage = () => {
  const header = MOCK_DASHBOARD_HEADER
  const names = MOCK_DASHBOARD_NAMES

  const displayName = header.primaryName
  const hasProfile = true

  return (
    <div className="mx-auto flex max-w-[1440px] items-start gap-8 px-[58px] py-[40px]">
      <DashboardSidebar
        hasProfile={hasProfile}
        profileName={header.primaryName}
      />

      <div className="min-w-0 flex-1 space-y-8">
        <div className="space-y-8">
          <div className="flex w-full items-start justify-between rounded-[8px] border-[#0080bc] border-[0.4px] bg-[#e5f7ff] px-[14px] py-[16px]">
            <div className="flex items-start gap-3">
              <div className="relative size-[14px] shrink-0">
                <CircleAlert className="size-full text-[#0080bc]" />
              </div>
              <div className="flex flex-col gap-2">
                <p className="font-medium font-sans text-[#0080bc] text-[14px] leading-[22px] tracking-[0.28px]">
                  You have a new wallet.
                </p>
                <p className="font-sans text-[#5c5b5b] text-[12px] leading-[1.2] tracking-[0.12px]">
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

          <h1 className="font-serif text-[#232222] text-[40px] leading-[0.96] tracking-[0.4px]">
            Hello {displayName}
          </h1>
        </div>

        <PrimaryNameCard
          primaryName={header.primaryName}
          address={header.address}
          registeredDate={header.registeredDate}
          expiryDate={header.expiryDate}
          avatarUrl={header.avatarUrl}
        />

        <div className="rounded-[8px] border-[#dededf] border-[0.25px] bg-white px-[24px] py-[32px]">
          <div className="space-y-5">
            <MyNamesCard names={names} isLoading={false} error={undefined} />
          </div>
        </div>

        <DidYouKnowSection />
        <FaqSection />
      </div>
    </div>
  )
}
