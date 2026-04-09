import {
  createFileRoute,
  type ErrorComponentProps,
} from '@tanstack/react-router'
import { match, P } from 'ts-pattern'
import { profileExpiryQuery } from '@/features/profile/service/profileExpiry'
import { parseName } from '@/features/register-v2'
import {
  RenewalUiProvider,
  useRenewalUiContext,
} from '@/features/renew/state/renewalUi.context'
import { useRenewalStep } from '@/features/renew/state/renewalUi.selectors'
import { RenewPricingStep } from '@/features/renew/workflow/pricing/PricingStep'
import { RenewingStep } from '@/features/renew/workflow/renewing/RenewingStep'
import { RenewFailureStep } from '@/features/renew/workflow/result/FailureStep'
import { RenewSuccessStep } from '@/features/renew/workflow/result/SuccessStep'

export const Route = createFileRoute('/renew/$name')({
  loader: async ({ params: { name }, context: { queryClient } }) => {
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

    const expiryData = await queryClient.ensureQueryData(
      profileExpiryQuery(name),
    )

    if (!expiryData?.expiry) {
      throw new Error('Name expiry could not be loaded')
    }

    return {
      label: parsedName.value.label,
      currentExpiry: expiryData.expiry,
    }
  },
  component: RouteComponent,
  errorComponent: ErrorComponent,
})

function RouteComponent() {
  const { label, currentExpiry } = Route.useLoaderData()

  return (
    <RenewalUiProvider currentExpiry={currentExpiry} label={label}>
      <PageContent />
    </RenewalUiProvider>
  )
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-center py-8">
        <div className="text-red-600">
          Error loading renewal: {error.message}
        </div>
      </div>
      <button onClick={reset} type="button">
        Try again
      </button>
    </div>
  )
}

function PageContent() {
  const { uiActor } = useRenewalUiContext()
  const step = useRenewalStep(uiActor)

  return match(step)
    .with('pricing', () => <RenewPricingStep />)
    .with(
      P.union(
        'submittingTokenApproval',
        'waitingForTokenApproval',
        'submittingRenewal',
        'waitingForRenewal',
      ),
      () => <RenewingStep />,
    )
    .with('success', () => <RenewSuccessStep />)
    .with('failure', () => <RenewFailureStep />)
    .exhaustive()
}
