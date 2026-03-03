import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { type Address, checksumAddress, isAddress } from 'viem'
import { NavBar } from '@/components/NavBar'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { ResolverSidebar } from '@/components/ResolverSidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

export const Route = createFileRoute('/resolver/$address')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  beforeLoad: (ctx) => {
    if (!isAddress(ctx.params.address, { strict: false })) {
      throw redirect({ to: '/' })
    }
  },
})

function RouteComponent() {
  const { address } = Route.useParams()
  return (
    <div className="[--header-height:calc(--spacing(16))]">
      <SidebarProvider className="flex flex-col">
        <NavBar />
        <div className="flex flex-1">
          <ResolverSidebar
            address={checksumAddress(address as Address) as Address}
          />
          <SidebarInset className="w-full min-w-0">
            <Outlet />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}
