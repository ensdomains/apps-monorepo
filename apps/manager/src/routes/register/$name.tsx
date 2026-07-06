import {
  createFileRoute,
  type ErrorComponentProps,
  redirect,
} from '@tanstack/react-router'
import { motion } from 'motion/react'
import { match } from 'ts-pattern'
import {
  FailureStep,
  getRegistrationV2AvailabilityQueryOptions,
  PricingStep,
  parseName,
  RegisteringStep,
  RegistrationV2UiProvider,
  SuccessStep,
} from '@/features/register-v2'
import { useRegistrationFlowController } from '@/features/weave-registration'

export const Route = createFileRoute('/register/$name')({
  loader: async ({ params: { name }, context: { queryClient } }) => {
    const availability = await queryClient.ensureQueryData(
      getRegistrationV2AvailabilityQueryOptions(name),
    )

    if (!availability.isAvailable) {
      throw redirect({
        to: '/$name',
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
      <PageContent key={label} />
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
