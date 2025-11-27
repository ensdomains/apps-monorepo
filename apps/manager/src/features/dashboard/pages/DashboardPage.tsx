import { DashboardSidebar } from '@/features/dashboard/components/DashboardSidebar'
import { DidYouKnowSection } from '@/features/dashboard/components/DidYouKnowSection'
import { FaqSection } from '@/features/dashboard/components/FaqSection'
import {
  FavoritesCard,
  MyNamesCard,
} from '@/features/dashboard/components/NamesTable'
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
    <div className="mx-auto flex max-w-6xl items-start gap-8 px-6 py-8">
      <DashboardSidebar
        hasProfile={hasProfile}
        profileName={header.primaryName}
      />

      <div className="flex-1 space-y-8">
        <section className="space-y-8">
          <h1 className="font-serif text-[#232222] text-[40px] tracking-[0.4px]">
            Hello {displayName}
          </h1>

          <div className="rounded-lg border border-[#0080bc] bg-[#e5f7ff] p-4">
            <div className="flex items-start gap-3">
              <svg
                className="size-3.5 shrink-0 text-[#0080bc]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <title>Info</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="flex-1">
                <p className="font-medium text-[#0080bc] text-sm">
                  You have a new wallet
                </p>
                <p className="mt-0.5 text-[#0080bc] text-xs">
                  Connect this wallet to manage your ENS names and update your
                  profile
                </p>
              </div>
              <button
                type="button"
                className="text-[#0080bc] hover:text-[#006699]"
                aria-label="Close alert"
              >
                <svg
                  className="size-[11px]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <title>Close</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        </section>

        <PrimaryNameCard
          primaryName={header.primaryName}
          address={header.address}
          registeredDate={header.registeredDate}
          expiryDate={header.expiryDate}
          avatarUrl={header.avatarUrl}
        />

        <section className="space-y-4">
          <MyNamesCard names={names} isLoading={false} error={undefined} />
          <FavoritesCard names={names} />
        </section>

        <DidYouKnowSection />
        <FaqSection />
      </div>
    </div>
  )
}
