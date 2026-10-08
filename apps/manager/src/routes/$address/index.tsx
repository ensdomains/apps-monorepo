import { createFileRoute } from '@tanstack/react-router'
import { AddressProfileView } from '@/features/profile/components/view/AddressProfileView'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { addressOgImageUrl, seo } from '@/utils/seo'

export const Route = createFileRoute('/$address/')({
  loader: async ({ params: { address }, context: { queryClient } }) => {
    const resolvedName = await queryClient.ensureQueryData(
      profileReverseNameQuery(address),
    )

    return { resolvedName: resolvedName ?? undefined }
  },
  head: ({ params: { address } }) => ({
    meta: seo({
      title: `${address} - ENS Profile`,
      description: `View the ENS profile for ${address}`,
      image: addressOgImageUrl(address),
    }),
  }),
  component: RouteComponent,
})

function RouteComponent() {
  const address = Route.useParams({ select: (params) => params.address })
  const reverseName = Route.useLoaderData({
    select: (data) => data.resolvedName,
  })

  return <AddressProfileView address={address} primaryName={reverseName} />
}
