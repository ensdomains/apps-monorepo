import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ChevronRight,
  Clock,
  Eye,
  FileText,
  Grid3x3,
  Lock,
  Repeat,
  SearchIcon,
  Sparkles,
  Users,
} from 'lucide-react'
import { useId } from 'react'
import { ExternalLink } from 'react-external-link'
import { useAccount, useDisconnect, useEnsName } from 'wagmi'
import { NavBar } from '@/components/molecules/NavBar'
import { Button } from '@/components/ui/button'
import { NameCount } from '@/features/dashboard/components/NameCount'

export const Route = createFileRoute('/')({
  component: RouteComponent,
})

const LinkBlock = ({
  title,
  description,
  href,
}: {
  title: string
  description: string
  href: string
}) => (
  <ExternalLink
    href={href}
    className="flex-1 min-w-[280px] p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors group"
  >
    <div className="flex flex-row justify-between items-start gap-4">
      <div>
        <h3 className="font-semibold text-base mb-1">{title}</h3>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
      <ChevronRight className="text-gray-400 group-hover:text-gray-600 flex-shrink-0 mt-1" />
    </div>
  </ExternalLink>
)

const ExampleNameCard = ({
  name,
  description,
}: {
  name: string
  description: string
}) => (
  <Link
    to="/$name"
    params={{ name }}
    className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors group"
  >
    <div className="flex flex-row justify-between items-start gap-4">
      <div>
        <h4 className="font-semibold text-base mb-1 font-mono">{name}</h4>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
      <ChevronRight className="text-gray-400 group-hover:text-gray-600 flex-shrink-0 mt-1" />
    </div>
  </Link>
)

const WhatsNewItem = ({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType
  title: string
  description: string
}) => (
  <button
    type="button"
    className="w-full p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors text-left group"
  >
    <div className="flex flex-row justify-between items-start gap-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-gray-50 flex-shrink-0">
          <Icon className="w-5 h-5 text-gray-700" />
        </div>
        <div>
          <h4 className="font-semibold text-base mb-1">{title}</h4>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
      </div>
      <ChevronRight className="text-gray-400 group-hover:text-gray-600 flex-shrink-0 mt-1" />
    </div>
  </button>
)

const UpNextItem = ({
  icon: Icon,
  title,
  description,
  status,
}: {
  icon: React.ElementType
  title: string
  description: string
  status: string
}) => (
  <div className="w-full p-4 rounded-lg border border-gray-200">
    <div className="flex flex-row justify-between items-start gap-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-gray-50 flex-shrink-0">
          <Icon className="w-5 h-5 text-gray-700" />
        </div>
        <div>
          <h4 className="font-semibold text-base mb-1">{title}</h4>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
      </div>
      <span className="text-xs font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full whitespace-nowrap">
        {status}
      </span>
    </div>
  </div>
)

const ConnectedWithENSName = () => {
  const { address } = useAccount()
  const { disconnect } = useDisconnect()
  const {
    data: ensName,
    isLoading,
    error,
  } = useEnsName({
    address,
  })

  if (error)
    return (
      <div>
        Failed to fetch ENS for address {address}: {error.message}
      </div>
    )

  if (isLoading) return <div>Loading...</div>

  if (address) {
    return (
      <section className="flex flex-col gap-6">
        <div className="flex flex-row justify-between items-center">
          <div className="w-full flex flex-row gap-2 items-baseline">
            {ensName && (
              <Link to="/$name" params={{ name: ensName }}>
                <h3 className="text-[28px] font-bold">{ensName}</h3>
              </Link>
            )}
            <Link to="/addr/$addr" params={{ addr: address }}>
              <span className="font-mono text-gray-500 font-medium">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
            </Link>
          </div>
          <Button
            onClick={() => disconnect()}
            variant="secondary"
            className="w-max hover:bg-red-300 hover:text-primary-foreground"
          >
            Disconnect
          </Button>
        </div>
        <div className="w-full flex justify-between gap-6 flex-wrap sm:flex-nowrap">
          <NameCount address={address} />
        </div>
      </section>
    )
  } else return null
}

function RouteComponent() {
  const id = useId()
  const navigate = Route.useNavigate()

  return (
    <>
      <NavBar />
      <main className="mx-auto py-10 flex flex-col gap-12 px-6">
        {/* Header Section */}
        <header className="flex flex-col gap-6">
          <div>
            <h1 className="text-[40px] font-bold">ENS Explorer</h1>
            <p className="text-gray-600">The definitive ENS name explorer.</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              const search = fd.get('search') as string
              navigate({ to: '/$name', params: { name: search } })
            }}
            className="w-full flex flex-row gap-4 items-center border border-gray-200 rounded-lg px-4 py-3 focus-within:border-gray-400 transition-colors"
          >
            <SearchIcon className="text-gray-400 w-5 h-5 flex-shrink-0" />
            <input
              name="search"
              id={id}
              className="w-full appearance-none border-none outline-none text-base bg-transparent"
              placeholder="Search a name or address..."
            />
            <kbd className="hidden sm:block px-2 py-1 text-xs text-gray-500 bg-gray-100 rounded border border-gray-200">
              /
            </kbd>
          </form>
        </header>

        {/* Connected Wallet Section */}
        <ConnectedWithENSName />

        {/* Welcome Section */}
        <section className="bg-gray-50 border border-gray-200 rounded-lg p-8">
          <h2 className="text-2xl font-bold mb-6">
            Welcome to the ENS Explorer Alpha
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8">
            <p className="text-gray-700">
              You're using an early version of the new ENS Explorer — our new
              source of truth for the ENS protocol. This Alpha is in active
              development, and new features will roll out regularly as we expand
              functionality.
            </p>
            <div className="flex flex-col gap-3 text-sm">
              <div>
                Need an ENSv2 name?{' '}
                <ExternalLink
                  href="https://app.ens.domains"
                  className="underline hover:no-underline"
                >
                  Register one in the new Manager →
                </ExternalLink>
              </div>
              <div>
                Deep dive into the new contracts?{' '}
                <ExternalLink
                  href="https://docs.ens.domains/ensv2"
                  className="underline hover:no-underline"
                >
                  Read the ENSv2 design doc →
                </ExternalLink>
              </div>
              <div>
                Want to learn more about ENSv2?{' '}
                <ExternalLink
                  href="https://docs.ens.domains"
                  className="underline hover:no-underline"
                >
                  Visit our info hub →
                </ExternalLink>
              </div>
              <div>
                Want to share feedback on the Alpha?{' '}
                <ExternalLink
                  href="https://t.me/ensdomains"
                  className="underline hover:no-underline"
                >
                  Join our Alpha TG group →
                </ExternalLink>
              </div>
            </div>
          </div>
        </section>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-12">
          {/* ENSv2 name examples */}
          <section className="flex flex-col gap-6">
            <h2 className="text-2xl font-bold">ENSv2 name examples</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <ExampleNameCard
                name="example.eth"
                description="Name with records on the new Dedicated Resolver"
              />
              <ExampleNameCard
                name="example.eth"
                description="Name with subnames on the new Registry contract"
              />
              <ExampleNameCard
                name="sub.example.eth"
                description="Subname on the new Registry contract"
              />
              <ExampleNameCard
                name="example.eth"
                description="Name with custom Roles created"
              />
              <ExampleNameCard
                name="example.eth"
                description="Name migrated to ENSv2"
              />
              <ExampleNameCard
                name="example.eth"
                description="Name with multiple L2 Primary set"
              />
            </div>
          </section>

          {/* What's new */}
          <section className="flex flex-col gap-6">
            <h2 className="text-2xl font-bold">What's new</h2>
            <div className="flex flex-col gap-4">
              <WhatsNewItem
                icon={Clock}
                title="Transaction history"
                description="View renewals and ownership changes over time."
              />
              <WhatsNewItem
                icon={Repeat}
                title="Dedicated resolvers"
                description="Each name now supports its own resolver."
              />
              <WhatsNewItem
                icon={Users}
                title="Roles"
                description="See which accounts hold key permissions."
              />
              <WhatsNewItem
                icon={Grid3x3}
                title="L2 Primary Names"
                description="Set and view primary names on other networks."
              />
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-12">
          {/* Learn about ENS development */}
          <section className="flex flex-col gap-6">
            <h2 className="text-2xl font-bold">Learn about ENS development</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <LinkBlock
                title="ENS Docs"
                description="Official docs for ENS and its integrations."
                href="https://docs.ens.domains"
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
                href="https://docs.ens.domains/ensv2"
              />
              <LinkBlock
                title="Unruggable Gateway"
                description="Censorship-resistant ENS resolution."
                href="https://github.com/ensdomains/evmgateway"
              />
              <LinkBlock
                title="Developer Telegram"
                description="Join the ENS dev chat."
                href="https://t.me/ensdomains"
              />
            </div>
          </section>

          {/* Up next in Alpha */}
          <section className="flex flex-col gap-6">
            <h2 className="text-2xl font-bold">Up next in Alpha</h2>
            <div className="flex flex-col gap-4">
              <UpNextItem
                icon={Grid3x3}
                title="Managing names"
                description="Browse, filter, organize and manage ENS names in one place."
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
                icon={Lock}
                title="Ownership control"
                description="See who owns a name, how it's controlled, and when it changes hands."
                status="In progress"
              />
              <UpNextItem
                icon={Sparkles}
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
