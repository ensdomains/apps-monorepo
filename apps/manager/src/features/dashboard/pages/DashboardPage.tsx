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
                {/* Component 1 Icon representation */}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <title>Info Icon</title>
                  <circle cx="7" cy="7" r="6.5" stroke="#0080BC" />
                  <path d="M7 3.5V7.5" stroke="#0080BC" strokeLinecap="round" />
                  <circle cx="7" cy="10" r="1" fill="#0080BC" />
                </svg>
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
              <svg
                className="size-[11px]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
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
            {/* This section handles Tabs and Data, delegated to components */}
            <MyNamesCard names={names} isLoading={false} error={undefined} />
            {/* Favorites logic will be integrated into NamesTable usually, but here they are separate cards in current implementation. 
                    I will need to refactor NamesTable to handle the layout properly if I want them combined or keep them as is.
                    Figma shows them in one container with Tabs. 
                    For now, I will update DashboardPage to match structure roughly but NamesTable needs significant work.
                */}
            {/* <FavoritesCard names={names} /> */}
            {/* Commenting out FavoritesCard as it seems integrated in Figma design inside "My names" container */}
          </div>
        </div>

        <DidYouKnowSection />
        <FaqSection />
      </div>
    </div>
  )
}
