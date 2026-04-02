import {
  createFileRoute,
  type ErrorComponentProps,
  redirect,
} from '@tanstack/react-router'
import { match } from 'ts-pattern'
import {
  FailureStep,
  getRegistrationV2AvailabilityQueryOptions,
  PricingStep,
  parseName,
  RegisteringStep,
  RegistrationV2UiProvider,
  SuccessStep,
  useRegistrationStep,
  useRegistrationV2Context,
} from '@/features/register-v2'

export const Route = createFileRoute('/register/$name')({
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
  const label = Route.useLoaderData({
    select: (data) => data.label,
  })

  return (
    <RegistrationV2UiProvider label={label}>
      <PageContent />
    </RegistrationV2UiProvider>
  )
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-center py-8">
        <div className="text-red-600">Error loading name: {error.message}</div>
      </div>
      <button onClick={reset} type="button">
        Try again
      </button>
    </div>
  )
}

function PageContent() {
  const { uiActor } = useRegistrationV2Context()
  const step = useRegistrationStep(uiActor)

  return (
    <div>
      {match(step)
        .with('pricing', () => <PricingStep />)
        .with('registering', () => <RegisteringStep />)
        .with('success', () => <SuccessStep />)
        .with('failure', () => <FailureStep />)
        .exhaustive()}
    </div>
  )
}
