import { createFileRoute, notFound, Outlet } from '@tanstack/react-router'
import { type Address, checksumAddress, isAddress } from 'viem'
import { MobileHeader } from '@/components/MobileHeader'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageContainer } from '@/components/PageContainer'
import { RegistrySidebar } from '@/components/RegistrySidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

export const Route = createFileRoute('/registry/$address')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  beforeLoad: (ctx) => {
    if (!isAddress(ctx.params.address, { strict: false })) {
      throw notFound()
    }
  },
})

function RouteComponent() {
  const { address } = Route.useParams()
  return (
    <SidebarProvider>
      <RegistrySidebar address={checksumAddress(address as Address)} />
      <SidebarInset className="w-full min-w-0">
        <MobileHeader />
        <PageContainer>
          <Outlet />
        </PageContainer>
      </SidebarInset>
    </SidebarProvider>
  )
}
