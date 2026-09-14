import {
  createFileRoute,
  type ErrorComponentProps,
  redirect,
} from '@tanstack/react-router'
import { motion } from 'motion/react'
import { match } from 'ts-pattern'
import { NameFallbackCard } from '@/components/NameFallbackCard'
import {
  FailureStep,
  getRegistrationV2AvailabilityQueryOptions,
  PricingStep,
  parseName,
  RegisteringStep,
  RegistrationV2UiProvider,
  ResumeCheckPlaceholder,
  SuccessStep,
  useRegistrationV2Context,
} from '@/features/register-v2'
import { useRegistrationFlowController } from '@/features/weave-registration'

export const Route = createFileRoute('/register/$name')({
  loader: async ({ params: { name }, context: { queryClient } }) => {
    // Validate the name shape first: the availability query can throw on
    // names the registrar doesn't understand
    const parsedName = parseName(name)

    if (parsedName.isErr()) {
      throw parsedName.error
    }

    if (parsedName.value.tld !== 'eth') {
      return { fallback: 'unsupported-tld' as const, label: '' }
    }

    if (parsedName.value.subLabels.length > 0) {
      throw new Error('Subnames are not supported')
    }

    // Availability, display and commit/reveal calldata all read this one
    // normalised name, so the label that gets hashed is the label that was
    // checked for availability.
    const { label, name: normalizedName } = parsedName.value

    // Labels under 3 code points can't be registered; send them to the
    // profile fallback instead of surfacing the availability error
    if ([...label].length < 3) {
      throw redirect({
        params: { name: normalizedName },
        to: '/$name',
        replace: true,
      })
    }

    const availability = await queryClient.ensureQueryData(
      getRegistrationV2AvailabilityQueryOptions(normalizedName),
    )

    if (!availability.isAvailable) {
      throw redirect({
        to: '/$name',
        params: { name: normalizedName },
      })
    }

    return {
      fallback: undefined,
      label,
    }
  },
  component: RouteComponent,
  errorComponent: ErrorComponent,
})

function RouteComponent() {
  const name = Route.useParams({ select: (params) => params.name })
  const { label, fallback } = Route.useLoaderData()

  if (fallback) return <NameFallbackCard name={name} reason={fallback} />

  return (
    <RegistrationV2UiProvider label={label}>
      <PageContent key={label} />
    </RegistrationV2UiProvider>
  )
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-center py-8">
        <div className="wrap-anywhere text-destructive">
          Error loading name: {error.message}
        </div>
      </div>
      <button onClick={reset} type="button">
        Try again
      </button>
    </div>
  )
}

function PageContent() {
  const { resume } = useRegistrationV2Context()
  const {
    step,
    sawWeaveFlow,
    fillProgress,
    fillDone,
    isRegistrationComplete,
    showRegisteringCompletion,
    markWeaveFlow,
    markCompletionAnimationDone,
  } = useRegistrationFlowController()

  if (step === 'registering' || showRegisteringCompletion) {
    return (
      <RegisteringStep
        fillDone={fillDone}
        fillProgress={fillProgress}
        isRegistrationComplete={isRegistrationComplete}
        onCompletionAnimationFinished={markCompletionAnimationDone}
        onWeaveFlowEntered={markWeaveFlow}
        sawWeaveFlow={sawWeaveFlow}
        showRegisteringCompletion={showRegisteringCompletion}
      />
    )
  }

  // A stored run for this name may be about to take the page over; hold
  // pricing back until the resume has decided.
  if (step === 'pricing' && resume.status === 'checking') {
    return <ResumeCheckPlaceholder />
  }

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {match(step)
        .with('pricing', () => <PricingStep />)
        .with('success', () => <SuccessStep />)
        .with('failure', () => <FailureStep />)
        .exhaustive()}
    </motion.div>
  )
}
