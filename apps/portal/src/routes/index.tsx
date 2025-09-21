import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronRight, SearchIcon } from 'lucide-react'
import { useId } from 'react'
import { ExternalLink } from 'react-external-link'
import type { Address } from 'viem'
import { useAccount, useDisconnect, useEnsName } from 'wagmi'
import { NavBar } from '@/components/molecules/NavBar'
import { Button } from '@/components/ui/button'
import { getNamesForAddressQueryOptions } from '@/features/dashboard/useNamesForAddress'

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
    className="w-[312px] p-6 rounded-md border border-gray-300 hover:bg-gray-100 duration-150"
  >
    <div className="flex flex-row justify-between items-center">
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm">{description}</p>
      </div>
      <div className="h-8 w-8 p-2 rounded-sm bg-gray-100 flex items-center justify-center">
        <ChevronRight height={16} width={16} />
      </div>
    </div>
  </ExternalLink>
)

const ExampleName = ({
  name,
  category,
}: {
  name: string
  category: string
}) => (
  <Link to="/$name" params={{ name }} className="px-6 py-4">
    <h4 className="font-mono font-medium">{name}</h4>
    <p>{category}</p>
  </Link>
)

const NameCount = ({ address }: { address: Address }) => {
  const {
    data: names,
    isLoading,
    error,
  } = useQuery(getNamesForAddressQueryOptions({ address }))

  if (error) {
    if (error._tag === 'Wagmi/ClientError')
      return <div>Error connecting to Ethereum</div>
    return <div>Error: {error.cause?.message}</div>
  }
  if (isLoading) return <div>Loading...</div>
  return (
    <div className="flex flex-row justify-between items-center w-full p-6 rounded-lg border border-gray-300">
      <div className="flex flex-col w-full">
        <div className="font-medium text-[26px]">{names?.length}</div>
        <div className="leading-none">names owned</div>
      </div>
      <div className="h-8 w-8 p-2 rounded-sm bg-gray-100 flex items-center justify-center">
        <ChevronRight height={16} width={16} />
      </div>
    </div>
  )
}

const ConnectedWithENSName = () => {
  const { address } = useAccount()
  const { disconnect } = useDisconnect()
  const { data: ensName, isLoading, error } = useEnsName({ address })

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
            <h3 className="text-[28px] font-bold">{ensName}</h3>
            <span className="font-mono text-gray-500 font-medium">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </span>
          </div>
          <Button
            onClick={() => disconnect()}
            variant="secondary"
            className="w-max hover:bg-red-300 hover:text-primary-foreground"
          >
            Disconnect
          </Button>
        </div>
        <div className="w-full flex justify-between gap-6">
          <NameCount address={address} />
          <div className="w-full p-6">placeholder</div>
        </div>
      </section>
    )
  } else return null
}

function RouteComponent() {
  const id = useId()

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-5xl py-10 flex flex-col gap-12">
        <header className="flex flex-col gap-6">
          <div>
            <h1 className="text-[40px] font-bold">ENS Explorer</h1>
            <p>The definitive ENS name explorer.</p>
          </div>
          <div className="w-full flex flex-row gap-4 items-center border border-border rounded-sm">
            <label htmlFor="search" aria-label="Search">
              <SearchIcon
                className="text-gray-600 ml-4 w-8"
                height={32}
                width={32}
              />
            </label>
            <input
              id={id}
              className="w-full appearance-none border-none outline-none text-2xl p-4"
              placeholder="Search..."
            />
          </div>
        </header>
        <ConnectedWithENSName />
        <section className="flex flex-col gap-6">
          <h2 className="text-2xl font-medium">Learn about ENS development</h2>
          <div className="grid grid-cols-[1fr_auto] gap-6">
            <div className="flex flex-row flex-wrap gap-4 w-full">
              <LinkBlock
                title="ENS Docs"
                description="The official documentation."
                href="https://docs.ens.domains"
              />
              <LinkBlock
                title="Namechain"
                description="ENSv2 contracts."
                href="https://github.com/ensdomains/namechain"
              />
              <LinkBlock
                title="Developer Telegram"
                description="Get help with development."
                href="https://t.me/ensdomains"
              />
            </div>
            <div className="flex flex-col gap-4 w-90">
              <h3 className="font-medium">Examples</h3>
              <div className="flex flex-col border border-gray-300 rounded-lg divide-y divide-gray-300">
                <ExampleName name="vitalik.eth" category="Standard setup" />
                <ExampleName name="😵💫😵💫😵💫.eth" category="Emojis" />
                <ExampleName name="öbb.eth" category="Mixed characters" />
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
