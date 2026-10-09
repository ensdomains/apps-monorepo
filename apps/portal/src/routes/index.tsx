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
      <SepoliaNoticeBanner />
      <HomeHeader />

      <section className="flex flex-col gap-10 items-center w-full max-w-140">
        {/* Figma hero type (ABC Marist 36px / 350 / 1.35) has no matching text token. */}
        <h1 className="font-serif text-page-title sm:text-h1 font-[350] text-center leading-[1.35] text-foreground">
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
