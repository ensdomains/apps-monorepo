import {
  createFileRoute,
  type ErrorComponentProps,
  redirect,
} from '@tanstack/react-router'
import { profileExpiryQuery } from '@/features/profile/service/profileExpiry'
import { profileOwnerQuery } from '@/features/profile/service/profileOwner'
import { getV1RenewableQueryOptions } from '@/features/renew/data/queries/v1Renewable.query'
import {
  parseRenewableName,
  refuseRenewal,
} from '@/features/renew/utils/renewableName'
import { RenewalRouteError } from '@/features/renew/workflow/components/RenewalRouteError'
import { RenewalPage } from '@/features/renew/workflow/RenewalPage'

export const Route = createFileRoute('/renew-v1/$name')({
  loader: async ({ params: { name }, context: { queryClient } }) => {
    const parsedName = parseRenewableName(name)

    if (parsedName.isErr()) {
      return refuseRenewal(parsedName.error.message)
    }

    // The gate, the price, the display and the calldata all read this one
    // normalised name, so the label hashed into `renew()` is the label priced.
    const { label, name: normalizedName } = parsedName.value

    const ownerData = await queryClient.ensureQueryData(
      profileOwnerQuery(normalizedName),
    )

    if (ownerData?.protocol === 'v2') {
      throw redirect({
        params: { name: normalizedName },
        to: '/renew/$name',
        replace: true,
      })
    }

    if (ownerData?.protocol !== 'v1') {
      return refuseRenewal('This ENSv1 name is not reserved or registered.')
    }

    // Fetched rather than read through the cache, as on the V2 route: a stale
    // entry can refuse a renewable name or start from an outdated expiry.
    const [expiryData, isRenewable] = await Promise.all([
      queryClient.fetchQuery(profileExpiryQuery(normalizedName, 'v1')),
      queryClient.fetchQuery(getV1RenewableQueryOptions(normalizedName)),
    ])

    if (!isRenewable) {
      return refuseRenewal(
        'This ENSv1 name is upgraded, unreserved, or outside its renewal window.',
      )
    }

    if (!expiryData?.expiry) {
      throw new Error('Name expiry could not be loaded.')
    }

    return {
      status: 'renewable' as const,
      label,
      currentExpiry: expiryData.expiry,
    }
  },
  component: RouteComponent,
  errorComponent: ErrorComponent,
})

function RouteComponent() {
  const data = Route.useLoaderData()
  const { name } = Route.useParams()

  if (data.status === 'refused') {
    return <RenewalRouteError message={data.message} name={name} />
  }

  return (
    <RenewalPage
      currentExpiry={data.currentExpiry}
      label={data.label}
      protocol="v1"
    />
  )
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const { name } = Route.useParams()
  return (
    <RenewalRouteError
      message={error instanceof Error ? error.message : undefined}
      name={name}
      onRetry={reset}
    />
  )
}
