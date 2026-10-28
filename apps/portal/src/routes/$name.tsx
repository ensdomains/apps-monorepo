import { getDnsSecEnabled } from '@ens-apps/utils/dnssec'
import {
  createFileRoute,
  Outlet,
  redirect,
  useParams,
} from '@tanstack/react-router'
import { MobileHeader } from '@/components/MobileHeader'
import { NonNormalizedNameWarning } from '@/components/NonNormalizedNameWarning'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageContainer } from '@/components/PageContainer'
import { ProfileSidebar } from '@/components/ProfileSidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import { useRememberName } from '@/hooks/useRememberName'
import { isRegistrable, isTLD } from '@/utils/ens/tldHelpers'
import { queryClient } from '@/utils/queryClient'
import { isValidEnsName } from '@/utils/token/isNormalized'
import type { ProtocolVersion } from '@/utils/types'

export const Route = createFileRoute('/$name')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  beforeLoad: async ({ params }) => {
    const { name } = params

    // A non-normalised spelling would be read as its normalised twin, a
    // different token. The page shows a warning instead, so skip the lookups.
    if (!isValidEnsName(name)) return {}

    // Redirect valid TLDs to the dedicated /tld/$tld route
    if (isTLD(name)) {
      const shouldRedirect =
        name === 'eth' || (await getDnsSecEnabled(name)) === true
      if (shouldRedirect) {
        throw redirect({ to: '/tld/$tld', params: { tld: name } })
      }
    }

    const ownerData = await queryClient.fetchQuery(
      getEnsOwnerQueryOptions({ name }),
    )
    return {
      protocolVersion: ownerData?.protocolVersion as
        | ProtocolVersion
        | undefined,
    }
  },
  loader: ({ params }) => {
    if (!isValidEnsName(params.name)) return

    return Promise.all([
      queryClient.prefetchQuery(
        getNameRegistriesQueryOptions({ name: params.name }),
      ),
      ...(isRegistrable(params.name)
        ? [
            queryClient.prefetchQuery(
              getNameAvailabilityQueryOptions({ name: params.name }),
            ),
          ]
        : []),
    ])
  },
})

function RouteComponent() {
  const { name } = useParams({ from: '/$name' })
  useRememberName(name)
  const isValidName = isValidEnsName(name)

  return (
    <SidebarProvider>
      <ProfileSidebar name={name} isDisabled={!isValidName} />
      <SidebarInset className="w-full min-w-0">
        <MobileHeader />
        <PageContainer>
          {isValidName ? <Outlet /> : <NonNormalizedNameWarning name={name} />}
        </PageContainer>
      </SidebarInset>
    </SidebarProvider>
  )
}
