import { createFileRoute, Outlet, useParams } from '@tanstack/react-router'
import { NavBar } from '@/components/NavBar'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { ProfileSidebar } from '@/components/ProfileSidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import { queryClient } from '@/utils/queryClient'
import type { EnsNetworkName } from '@/utils/types'

export const Route = createFileRoute('/$name')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  beforeLoad: async ({ params }) => {
    const ownerData = await queryClient.fetchQuery(
      getEnsOwnerQueryOptions({ name: params.name }),
    )
    return { network: ownerData?.network as EnsNetworkName | undefined }
  },
  loader: ({ params, context: { network } }) =>
    queryClient.prefetchQuery(
      getNameRegistriesQueryOptions({
        name: params.name,
        network: network ?? 'namechainSepolia',
      }),
    ),
})

function RouteComponent() {
  const { name } = useParams({ from: '/$name' })
  return (
    <div className="[--header-height:calc(--spacing(16))]">
      <SidebarProvider className="flex flex-col">
        <NavBar />
        <div className="flex flex-1">
          <ProfileSidebar name={name} />
          <SidebarInset className="w-full min-w-0">
            <Outlet />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}
