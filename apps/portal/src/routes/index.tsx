import { createFileRoute } from '@tanstack/react-router'
import { useConnection } from 'wagmi'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { SepoliaNoticeBanner } from '@/components/SepoliaNoticeBanner'
import {
  ConnectWalletMessage,
  EnsV2InfoMessage,
  HomeHeader,
  HomeSearchInput,
  RecentActivityTable,
  YourNames,
} from '@/features/dashboard/components'

export const Route = createFileRoute('/')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  staticData: { hideSidebar: true },
})

function RouteComponent() {
  const { address } = useConnection()

  return (
    <main className="min-h-screen flex flex-col items-center gap-18 px-6 pt-6 pb-18">
      {/* Logo and the Sepolia notice share one row so the notice doesn't
          push the page down; `sm:items-start` keeps the logo pinned at the
          same y as the sidebar's. Below `sm` they stack and the logo centres. */}
      <div className="w-full flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <HomeHeader />
        <div className="flex-1 min-w-0">
          <SepoliaNoticeBanner />
        </div>
      </div>

      {/* -mt-6 trims this one gap from the grid's 72px to 48px; the page's
          other gaps keep the 72px rhythm. */}
      <section className="flex flex-col gap-10 items-center w-full max-w-140 -mt-6">
        {/* Figma hero type (ABC Marist 36px / 350 / 1.35) has no matching text token. */}
        <h1 className="font-serif text-h1 font-[350] text-center leading-[1.35] text-foreground">
          Explore the source of truth <br className="hidden sm:inline" />
          for Ethereum Name Service
        </h1>
        <HomeSearchInput
          isHero
          ariaLabel="Search for a name, wallet, or contract"
        />
      </section>

      <section className="flex flex-col gap-6 w-full max-w-175">
        {address ? <YourNames address={address} /> : <ConnectWalletMessage />}
        <EnsV2InfoMessage />
        <RecentActivityTable />
      </section>
    </main>
  )
}
