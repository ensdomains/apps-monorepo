import { createFileRoute, Outlet } from '@tanstack/react-router'
import { type Address, checksumAddress } from 'viem'
import { AddrSidebar } from '@/components/molecules/AddrSidebar'
import { NavBar } from '@/components/molecules/NavBar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

export const Route = createFileRoute('/addr/$addr')({
  component: RouteComponent,
})

function RouteComponent() {
  const { addr } = Route.useParams()
  return (
    <div className="[--header-height:calc(--spacing(16))]">
      <SidebarProvider className="flex flex-col">
        <NavBar />
        <div className="flex flex-1">
          <AddrSidebar addr={checksumAddress(addr as Address)} />
          <SidebarInset className="w-full">
            <Outlet />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}
