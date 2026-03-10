import { useQuery } from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'
import { useEffect } from 'react'
import { match } from 'ts-pattern'
import { RegistrationV2ErrorState } from '@/features/register-v2/components/states/RegistrationV2ErrorState'
import { RegistrationV2FailureState } from '@/features/register-v2/components/states/RegistrationV2FailureState'
import { RegistrationV2LoadingState } from '@/features/register-v2/components/states/RegistrationV2LoadingState'
import { RegistrationV2ReadyState } from '@/features/register-v2/components/states/RegistrationV2ReadyState'
import { RegistrationV2SuccessState } from '@/features/register-v2/components/states/RegistrationV2SuccessState'
import { RegistrationV2TransactionState } from '@/features/register-v2/components/states/RegistrationV2TransactionState'
import { RegistrationV2UnavailableState } from '@/features/register-v2/components/states/RegistrationV2UnavailableState'
import {
  RegistrationV2UiProvider,
  useRegistrationV2Context,
  useRegistrationV2Selector,
  useRegistrationV2TransactionSelector,
} from '@/features/register-v2/machines/RegistrationV2UiContext'
import { getRegistrationV2AvailabilityQueryOptions } from '@/features/register-v2/queries/registrationV2AvailabilityQueryOptions'
import { normalizeDomainNameFromUrl } from '@/utils/domain'

interface RegistrationV2PageProps {
  routeName: string
}

export const RegistrationV2Page = ({ routeName }: RegistrationV2PageProps) => {
  const targetName = normalizeDomainNameFromUrl(routeName)

  return (
    <RegistrationV2UiProvider>
      <RegistrationV2PageContent targetName={targetName} />
    </RegistrationV2UiProvider>
  )
}

interface RegistrationV2PageContentProps {
  targetName: string
}

function RegistrationV2PageContent({
  targetName,
}: RegistrationV2PageContentProps) {
  const { uiActor } = useRegistrationV2Context()

  const uiState = useRegistrationV2Selector((state) => state.value)
  const isRegistering = uiState === 'registering'

  const registrationStateValue = useRegistrationV2TransactionSelector(
    (state) => state?.value ?? 'idle',
  )
  const registrationErrorMessage = useRegistrationV2TransactionSelector(
    (state) => state?.context.error?.message,
  )

  useEffect(() => {
    if (!isRegistering) return

    if (registrationStateValue === 'success') {
      uiActor.send({ type: 'TX_SUCCEEDED' })
      return
    }

    if (registrationStateValue === 'error') {
      uiActor.send({
        type: 'TX_FAILED',
        message: registrationErrorMessage,
      })
    }
  }, [isRegistering, registrationStateValue, registrationErrorMessage, uiActor])

  useBlocker({
    shouldBlockFn: () => {
      if (!isRegistering) return false

      const shouldLeave = confirm(
        'Your registration is in progress. Leaving may interrupt it. Are you sure you want to leave?',
      )

      return !shouldLeave
    },
  })

  const availabilityQuery = useQuery(
    getRegistrationV2AvailabilityQueryOptions(targetName),
  )
  const availabilityState = match(availabilityQuery)
    .with({ status: 'pending' }, () => 'loading' as const)
    .with({ status: 'error' }, () => 'error' as const)
    .with(
      { status: 'success', data: { isAvailable: false } },
      () => 'unavailable' as const,
    )
    .with(
      { status: 'success', data: { isAvailable: true } },
      () => 'available' as const,
    )
    .exhaustive()

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-8">
      <div className="space-y-1">
        <p className="font-mono text-muted-foreground text-xs uppercase tracking-wide">
          registration v2
        </p>
        <p className="text-muted-foreground text-sm">
          The route owns the target name. Query data stays in React Query.
          Transaction execution runs in the shared registration actor.
        </p>
      </div>

      {match({ availabilityState, uiState })
        .with({ availabilityState: 'loading' }, () => (
          <RegistrationV2LoadingState targetName={targetName} />
        ))
        .with({ availabilityState: 'error' }, () => (
          <RegistrationV2ErrorState
            message={
              availabilityQuery.error instanceof Error
                ? availabilityQuery.error.message
                : 'Failed to load registration data.'
            }
            targetName={targetName}
          />
        ))
        .with({ availabilityState: 'unavailable' }, () => (
          <RegistrationV2UnavailableState
            message={`${targetName} is not available to register.`}
            targetName={targetName}
          />
        ))
        .with({ availabilityState: 'available', uiState: 'editing' }, () => (
          <RegistrationV2ReadyState targetName={targetName} />
        ))
        .with(
          { availabilityState: 'available', uiState: 'registering' },
          () => <RegistrationV2TransactionState targetName={targetName} />,
        )
        .with({ availabilityState: 'available', uiState: 'success' }, () => (
          <RegistrationV2SuccessState targetName={targetName} />
        ))
        .with({ availabilityState: 'available', uiState: 'failure' }, () => (
          <RegistrationV2FailureState targetName={targetName} />
        ))
        .exhaustive()}
    </main>
  )
}
