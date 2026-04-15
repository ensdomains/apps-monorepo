import { createFileRoute } from '@tanstack/react-router'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import {
  HomeHeader,
  HomeSearchInput,
  InfoBlockCard,
  LinkBlockCard,
  RecentActivityTable,
} from '@/features/dashboard/components'

export const Route = createFileRoute('/')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  staticData: { hideSidebar: true },
})

function RouteComponent() {
  return (
    <main className="min-h-screen flex flex-col items-center gap-24 px-6 py-18">
      <HomeHeader />

      <section className="flex flex-col gap-12 items-center w-full max-w-3xl">
        <p className="font-serif text-[32px] font-[350] text-center leading-[1.35] text-foreground">
          Explore the decentralized source of truth
          <br />
          for Ethereum Name Service
        </p>
        <HomeSearchInput className="bg-card dark:bg-transparent w-91.75 max-w-full rounded-lg border-border shadow-none" />
      </section>

      <section className="flex flex-col gap-8 items-center w-full max-w-4xl">
        <div className="flex gap-6 flex-wrap justify-center">
          <InfoBlockCard
            title="Welcome to the ENS Explorer Beta!"
            description="This is in active development, and new features will roll out regularly"
          />
          <LinkBlockCard
            title="Register a new name in the ENS Manager app"
            href="https://app.ens.dev/"
            hoverColor="lapis"
          />
          <LinkBlockCard
            title="Learn what's new in ENSv2"
            description="Visit our info hub"
            href="https://ens.domains/ensv2"
            hoverColor="peridot"
          />
          <LinkBlockCard
            title="Deep dive into the new contracts"
            description="Read about ENSv2 architecture"
            href="https://ens.domains/blog/post/ensv2-architecture"
            hoverColor="garnet"
          />
        </div>
        <RecentActivityTable />
      </section>
    </main>
  )
}
