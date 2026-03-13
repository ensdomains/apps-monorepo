import {
  createFileRoute,
  type ErrorComponentProps,
  redirect,
} from '@tanstack/react-router'
import { match, P } from 'ts-pattern'
import { RegistrationV2FailureState } from '@/features/register-v2/components/states/RegistrationV2FailureState'
import { RegistrationV2SuccessState } from '@/features/register-v2/components/states/RegistrationV2SuccessState'
import { RegistrationV2TransactionState } from '@/features/register-v2/components/states/RegistrationV2TransactionState'
import {
  createRegistrationV2UiSelector,
  RegistrationV2UiProvider,
  useRegistrationV2Context,
} from '@/features/register-v2/machines/RegistrationV2UiContext'
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

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-center py-8">
        <div className="text-red-600">Error loading name: {error.message}</div>
      </div>
      <button onClick={reset}>Try again</button>
    </div>
  )
}

const useRegistrationStep = createRegistrationV2UiSelector((state) =>
  match(state.value)
    .with({ pricing: P.string }, () => 'pricing' as const)
    .with(P.string, (step) => step)
    .exhaustive(),
)

function PageContent() {
  const { uiActor } = useRegistrationV2Context()

  const step = useRegistrationStep(uiActor)
  return (
    <div>
      {match(step)
        .with('pricing', () => <PricingStep />)
        .with('registering', () => <RegistrationV2TransactionState />)
        .with('success', () => <RegistrationV2SuccessState />)
        .with('failure', () => <RegistrationV2FailureState />)
        // .exhaustive()
        .otherwise(() => (
          <div>Unknown step</div>
        ))}
    </div>
  )
}
