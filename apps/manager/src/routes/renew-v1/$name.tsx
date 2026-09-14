import {
  createFileRoute,
  type ErrorComponentProps,
  redirect,
} from '@tanstack/react-router'
import { profileExpiryQuery } from '@/features/profile/service/profileExpiry'
import { profileOwnerQuery } from '@/features/profile/service/profileOwner'
import { getV1RenewableQueryOptions } from '@/features/renew/data/queries/v1Renewable.query'
import { parseRenewableName } from '@/features/renew/utils/renewableName'
import { RenewalRouteError } from '@/features/renew/workflow/components/RenewalRouteError'
import { RenewalPage } from '@/features/renew/workflow/RenewalPage'

export const Route = createFileRoute('/renew-v1/$name')({
  loader: async ({ params: { name }, context: { queryClient } }) => {
    const parsedName = parseRenewableName(name)

    if (parsedName.isErr()) {
      throw parsedName.error
    }

    // One normalised name drives the gate, the price, the display and the
    // calldata: the label signed into `renew()` is the label gated here.
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
      throw new Error('This ENSv1 name is not reserved or registered.')
    }

    const [expiryData, isRenewable] = await Promise.all([
      queryClient.ensureQueryData(profileExpiryQuery(normalizedName, 'v1')),
      queryClient.ensureQueryData(getV1RenewableQueryOptions(normalizedName)),
    ])

    if (!isRenewable) {
      throw new Error(
        'This ENSv1 name is migrated, unreserved, or outside its renewal window.',
      )
    }

    if (!expiryData?.expiry) {
      throw new Error('Name expiry could not be loaded.')
    }

    // Defence in depth: refuse to sign a different label than the one whose
    // expiry and renewability were just checked.
    if (expiryData.label !== label) {
      throw new Error('This name could not be verified for renewal.')
    }

    return {
      label,
      currentExpiry: expiryData.expiry,
    }
  },
  component: RouteComponent,
  errorComponent: ErrorComponent,
})

function RouteComponent() {
  const { label, currentExpiry } = Route.useLoaderData()
  return (
    <RenewalPage currentExpiry={currentExpiry} label={label} protocol="v1" />
  )
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const { name } = Route.useParams()
  return <RenewalRouteError error={error} name={name} reset={reset} />
}
