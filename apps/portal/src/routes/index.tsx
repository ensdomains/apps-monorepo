import { createFileRoute } from '@tanstack/react-router'
import {
  Clock,
  Eye,
  FileText,
  Grid3x3,
  PaintRoller,
  Repeat,
  UserLock,
  Users,
} from 'lucide-react'
import { ExternalLink } from 'react-external-link'
import { NavBar } from '@/components/NavBar'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import {
  ExampleNameCard,
  HomeSearchInput,
  LinkBlock,
  UpNextItem,
  WhatsNewItem,
} from '@/features/dashboard/components'
import { DashboardProfilePreview } from '@/features/dashboard/components/DashboardProfilePreview'

export const Route = createFileRoute('/')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  staticData: { hasSidebar: false },
})

function RouteComponent() {
  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-360 py-10 flex flex-col gap-12 px-6">
        <header className="flex flex-col gap-6">
          <div>
            <h1 className="text-[40px] font-bold">ENS Explorer</h1>
            <p className="text-gray-600">The definitive ENS name explorer.</p>
          </div>
          <HomeSearchInput />
        </header>

        <section className="bg-gray-100 xl:rounded-lg border border-gray-300 p-8 -mx-6 md:mx-0">
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8">
            <div className="flex flex-col gap-4 items-start">
              <h2 className="text-2xl font-bold">
                Welcome to the ENS Explorer Alpha
              </h2>
              <p className="text-gray-700">
                You're using an early version of the new ENS Explorer — our new
                source of truth for the ENS protocol. This Alpha is in active
                development, and new features will roll out regularly as we
                expand functionality.
              </p>
            </div>
            <div className="flex flex-col gap-3 text-sm">
              <div>
                <span className="font-medium text-gray-700 mr-2">
                  Need an ENSv2 name?
                </span>
                <ExternalLink
                  href="https://manager.ens.dev/"
                  className="underline hover:no-underline"
                >
                  Register one in the new Manager →
                </ExternalLink>
              </div>
              <div>
                <span className="font-medium text-gray-700 mr-2">
                  Deep dive into the new contracts?
                </span>
                <ExternalLink
                  href="https://ens.domains/blog/post/ensv2"
                  className="underline hover:no-underline"
                >
                  Read the ENSv2 design doc →
                </ExternalLink>
              </div>
              <div>
                <span className="font-medium text-gray-700 mr-2">
                  Want to learn more about ENSv2?
                </span>
                <ExternalLink
                  href=" https://ens.domains/ensv2"
                  className="underline hover:no-underline"
                >
                  Visit our info hub →
                </ExternalLink>
              </div>
              {/* <div>
                <span className="font-medium text-gray-700 mr-2">
                  Want to share feedback on the Alpha?
                </span>
                <ExternalLink
                  href="https://t.me/ensdomains"
                  className="underline hover:no-underline"
                >
                  Join our Alpha TG group →
                </ExternalLink>
              </div> */}
            </div>
          </div>
        </section>

        <DashboardProfilePreview />

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-12">
          <section className="flex flex-col gap-6">
            <h2 className="text-2xl font-bold">ENSv2 name examples</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <ExampleNameCard
                name="ens2.eth"
                description="Name with records on a new Dedicated Resolver"
              />
              <ExampleNameCard
                name="fresh.eth"
                description="Name with a cloned Dedicated Resolver from ens2.eth"
              />
              <ExampleNameCard
                name="ens1.eth"
                description="Name with a subregistry"
              />
              <ExampleNameCard
                name="2.sugh101.eth"
                description="Subname on the new UserRegistry contract"
                link="registry"
              />
              <ExampleNameCard
                name="withroles.eth"
                description="Name with custom roles created"
                link="roles"
              />
            </div>
          </section>

          <section className="flex flex-col gap-6">
            <h2 className="text-2xl font-bold">What's new</h2>
            <div className="flex flex-col gap-4">
              <WhatsNewItem
                icon={Clock}
                to="/$name/history"
                params={{ name: 'v1rtl.eth' }}
                title="Transaction history"
                description="View renewals and ownership changes over time."
              />
              <WhatsNewItem
                icon={Repeat}
                to="/$name/resolver"
                params={{ name: 'fresh.eth' }}
                title="Dedicated resolvers"
                description="Each name now supports its own resolver."
              />
              <WhatsNewItem
                icon={Users}
                to="/$name"
                params={{ name: 'withroles.eth' }}
                title="Roles"
                description="See which accounts hold key permissions."
              />
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-12">
          <section className="flex flex-col gap-6">
            <h2 className="text-2xl font-bold">Learn about ENS development</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <LinkBlock
                title="ENS Docs"
                description="Official docs for ENS and its integrations."
                href="https://ens.domains/ensv2"
              />
              <LinkBlock
                title="ENS Contracts"
                description="View core ENS smart contracts."
                href="https://github.com/ensdomains/ens-contracts"
              />
              <LinkBlock
                title="CCIP Read"
                description="How ENS resolves data across chains."
                href="https://eips.ethereum.org/EIPS/eip-3668"
              />
              <LinkBlock
                title="ENSv2 Design Doc"
                description="Architecture overview of ENSv2 and Namechain."
                href="https://ens.domains/blog/post/ensv2"
              />
              <LinkBlock
                title="Unruggable Gateway"
                description="Censorship-resistant ENS resolution."
                href="https://github.com/ensdomains/evmgateway"
              />
              {/* <LinkBlock
                title="Developer Telegram"
                description="Join the ENS dev chat."
                href="https://t.me/ensdomains"
              /> */}
            </div>
          </section>

          <section className="flex flex-col gap-6">
            <h2 className="text-2xl font-bold">Up next in Alpha</h2>
            <div className="flex flex-col gap-4">
              <UpNextItem
                icon={Grid3x3}
                title="L2 Primary Names"
                description="Set and view primary names on other networks."
                status="Up next"
              />
              <UpNextItem
                icon={FileText}
                title="Advanced record editing"
                description="Edit and manage your records with higher precision."
                status="In progress"
              />
              <UpNextItem
                icon={Eye}
                title="Deep name info"
                description="Drill into registration data, expiry, and contract state for any name."
                status="In progress"
              />
              <UpNextItem
                icon={UserLock}
                title="Ownership control"
                description="See who owns a name, how it's controlled, and when it changes hands."
                status="In progress"
              />
              <UpNextItem
                icon={PaintRoller}
                title="High fidelity redesign"
                description="A visual refresh for clarity, functionality, and beauty."
                status="Coming soon"
              />
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
