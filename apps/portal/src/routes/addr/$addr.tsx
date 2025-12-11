import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { type Address, checksumAddress, isAddress } from 'viem'
import { AddrSidebar } from '@/components/molecules/AddrSidebar'
import { NavBar } from '@/components/molecules/NavBar'
import { NotFoundMessage } from '@/components/molecules/NotFoundMessage'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

export const Route = createFileRoute('/addr/$addr')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  beforeLoad: (ctx) => {
    if (!isAddress(ctx.params.addr, { strict: false })) {
      throw redirect({ to: '/$name', params: { name: ctx.params.addr } })
    }
  },
})

function RouteComponent() {
  const { addr } = Route.useParams()
  return (
    <div className="[--header-height:calc(--spacing(16))]">
      <SidebarProvider className="flex flex-col">
        <NavBar />
        <div className="flex flex-1">
          <AddrSidebar addr={checksumAddress(addr as Address)} />
          <SidebarInset className="w-full min-w-0">
            <Outlet />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}
