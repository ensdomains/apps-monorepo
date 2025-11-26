import { DashboardSidebar } from '@/features/dashboard/components/DashboardSidebar'
import { DidYouKnowSection } from '@/features/dashboard/components/DidYouKnowSection'
import { FaqSection } from '@/features/dashboard/components/FaqSection'
import { NamesTable } from '@/features/dashboard/components/NamesTable'
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
  const hasNames = names.length > 0

  return (
    <div className="mx-auto flex max-w-6xl items-start gap-8 px-6 py-8">
      <DashboardSidebar
        hasProfile={hasProfile}
        profileName={header.primaryName}
      />

      <div className="flex-1 space-y-6">
        <section className="space-y-4">
          <div className="space-y-2">
            <h1 className="font-semibold font-serif text-3xl">
              Hello {displayName}
            </h1>
            <p className="text-muted-foreground text-sm">
              View your primary ENS name, manage your names, and explore tips
              and resources.
            </p>
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
          <NamesTable names={names} isLoading={false} error={undefined} />
        </section>

        <DidYouKnowSection />
        <FaqSection />
      </div>
    </div>
  )
}
