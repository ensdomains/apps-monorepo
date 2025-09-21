import { createFileRoute } from '@tanstack/react-router'
import { ChevronRight, SearchIcon } from 'lucide-react'
import { useId } from 'react'
import { ExternalLink } from 'react-external-link'
import { NavBar } from '@/components/molecules/NavBar'

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
      <div className="h-8 w-8 p-2 rounded-sm bg-gray-200 flex items-center justify-center">
        <ChevronRight height={16} width={16} />
      </div>
    </div>
  </ExternalLink>
)

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
        <section className="flex flex-col gap-6">
          <h2 className="text-2xl font-medium">Learn about ENS development</h2>
          <div className="flex flex-row flex-wrap gap-6">
            <div className="flex flex-row flex-wrap gap-4 max-w-160">
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
          </div>
        </section>
      </main>
    </>
  )
}
