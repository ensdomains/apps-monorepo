import { useSuspenseQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  type ErrorComponentProps,
  redirect,
} from '@tanstack/react-router'
import { RegistrationV2UiProvider } from '@/features/register-v2/machines/RegistrationV2UiContext'
import { getRegistrationV2AvailabilityQueryOptions } from '@/features/register-v2/queries/registrationV2AvailabilityQueryOptions'
import { PricingStep } from '@/features/register-v2/steps/pricing'
import { parseName } from '@/features/register-v2/utils/name-parser'

export const Route = createFileRoute('/register-v2/$name')({
  // beforeLoad: ({ params: { name } }) => {
  //   const normalizedName = normalizeDomainNameFromUrl(name)

  //   if (normalizedName && normalizedName !== name) {
  //     throw redirect({
  //       to: '/register-v2/$name',
  //       params: { name: normalizedName },
  //       replace: true,
  //     })
  //   }
  // },
  loader: async ({ params: { name }, context: { queryClient } }) => {
    const availability = await queryClient.ensureQueryData(
      getRegistrationV2AvailabilityQueryOptions(name),
    )

    if (!availability.isAvailable) {
      throw redirect({
        to: '/p/$name',
        params: { name: name },
      })
    }

    const parsedName = parseName(name)

    if (parsedName.isErr()) {
      throw parsedName.error
    }

    if (parsedName.value.tld !== 'eth') {
      throw new Error('Only .eth names are supported')
    }

    if (parsedName.value.subLabels.length > 0) {
      throw new Error('Subnames are not supported')
    }

    return {
      label: parsedName.value.label,
    }
  },
  component: RouteComponent,
  errorComponent: ErrorComponent,
})

function RouteComponent() {
  const { label } = Route.useLoaderData()
  return (
    <RegistrationV2UiProvider label={label}>
      <PageContent />
    </RegistrationV2UiProvider>
  )
}

function ErrorComponent({ error }: ErrorComponentProps) {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-center py-8">
        <div className="text-red-600">Error loading name: {error.message}</div>
      </div>
    </div>
  )
}

function PageContent() {
  const { name } = Route.useParams()
  const { label } = Route.useLoaderData()

  const availabilityQuery = useSuspenseQuery(
    getRegistrationV2AvailabilityQueryOptions(name),
  )

  return (
    <div>
      <PricingStep label={label} />
    </div>
  )
}
