import {
  createFileRoute,
  type ErrorComponentProps,
  redirect,
} from '@tanstack/react-router'
import { isPastGracePeriod } from '@/features/grace/utils/gracePeriod'
import {
  profileExpiryDateFromSeconds,
  profileExpiryQuery,
} from '@/features/profile/service/profileExpiry'
import {
  canRenewV2Name,
  resolveRenewalLabel,
  toCanonicalRenewableName,
} from '@/features/renew/utils/renewableName'
import { RenewalRouteError } from '@/features/renew/workflow/components/RenewalRouteError'
import { RenewalPage } from '@/features/renew/workflow/RenewalPage'

export const Route = createFileRoute('/renew/$name')({
  loader: async ({ params: { name }, context: { queryClient } }) => {
    // `ALICE.eth` and its look-alikes renew `alice.eth`, so they don't resolve
    // here — redirect rather than charge on a page titled with what was typed.
    const renewalLabel = resolveRenewalLabel(name)

    if (renewalLabel.isErr()) {
      const canonicalName = toCanonicalRenewableName(name)

      if (canonicalName === null) throw renewalLabel.error

      throw redirect({
        params: { name: canonicalName },
        to: '/renew/$name',
        replace: true,
      })
    }

    // Fetched rather than read through the cache: a name registered moments ago
    // has an entry from before it existed, and serving that reports the name as
    // unrenewable for the rest of the session.
    const expiryData = await queryClient.fetchQuery(profileExpiryQuery(name))

    if (expiryData?.protocol === 'v1') {
      throw redirect({
        params: { name },
        to: '/renew-v1/$name',
        replace: true,
      })
    }

    if (expiryData?.protocol !== 'v2') {
      throw new Error('This name is not available for renewal.')
    }

    if (expiryData.expiry === null) {
      if (expiryData.isNonExpiring) {
        throw new Error(
          'This name has no expiry, so there is nothing to renew.',
        )
      }

      // No expiry record at all means the label is unregistered.
      throw redirect({
        params: { name },
        to: '/register/$name',
        replace: true,
      })
    }

    const expiryDate = profileExpiryDateFromSeconds(expiryData.expiry)

    if (isPastGracePeriod(expiryDate, expiryData.protocol)) {
      throw redirect({
        params: { name },
        to: '/register/$name',
        replace: true,
      })
    }

    if (!canRenewV2Name(name, expiryDate)) {
      throw new Error('This name is outside its renewal window.')
    }

    return {
      label: renewalLabel.value,
      currentExpiry: expiryData.expiry,
    }
  },
  component: RouteComponent,
  errorComponent: ErrorComponent,
})

function RouteComponent() {
  const { label, currentExpiry } = Route.useLoaderData()
  return (
    <RenewalPage currentExpiry={currentExpiry} label={label} protocol="v2" />
  )
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const { name } = Route.useParams()
  return <RenewalRouteError error={error} name={name} reset={reset} />
}
