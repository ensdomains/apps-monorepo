import {
  createFileRoute,
  type ErrorComponentProps,
  redirect,
} from '@tanstack/react-router'
import { match, P } from 'ts-pattern'
import { isPastGracePeriod } from '@/features/grace/utils/gracePeriod'
import {
  profileExpiryDateFromSeconds,
  profileExpiryQuery,
} from '@/features/profile/service/profileExpiry'
import {
  RenewalUiProvider,
  useRenewalUiContext,
} from '@/features/renew/state/renewalUi.context'
import { useRenewalStep } from '@/features/renew/state/renewalUi.selectors'
import {
  canRenewV2Name,
  parseRenewableName,
} from '@/features/renew/utils/renewableName'
import { RenewPricingStep } from '@/features/renew/workflow/pricing/PricingStep'
import { RenewingStep } from '@/features/renew/workflow/renewing/RenewingStep'
import { RenewFailureStep } from '@/features/renew/workflow/result/FailureStep'
import { RenewSuccessStep } from '@/features/renew/workflow/result/SuccessStep'
import { isFeatureEnabled } from '@/utils/feature-flags'

export const Route = createFileRoute('/renew/$name')({
  loader: async ({ params: { name }, context: { queryClient } }) => {
    const parsedName = parseRenewableName(name)

    if (parsedName.isErr()) {
      throw parsedName.error
    }

    const expiryData = await queryClient.ensureQueryData(
      profileExpiryQuery(name),
    )

    const expiryDate = profileExpiryDateFromSeconds(expiryData?.expiry)

    if (isPastGracePeriod(expiryDate, true)) {
      throw redirect(
        isFeatureEnabled('REGISTRATION_V2')
          ? {
              params: { name },
              to: '/register/$name',
              replace: true,
            }
          : {
              search: {
                name,
                duration: 1,
              },
              to: '/register',
              replace: true,
            },
      )
    }

    if (!canRenewV2Name(name, expiryDate)) {
      throw new Error('This name cannot be renewed')
    }

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
        'ensuringHcaDeployed',
        'checkingAllowance',
        'signingPermit',
        'submittingTokenApproval',
        'waitingForTokenApproval',
        'submittingRenewal',
        'submittingRenewalBundle',
        'submittingPlainRenewal',
        'waitingForRenewal',
      ),
      () => <RenewingStep />,
    )
    .with('success', () => <RenewSuccessStep />)
    .with('failure', () => <RenewFailureStep />)
    .exhaustive()
}
