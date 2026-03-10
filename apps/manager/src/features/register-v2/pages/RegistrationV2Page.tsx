import { useQuery } from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'
import { useSelector } from '@xstate/react'
import { useEffect } from 'react'
import { RegistrationV2ErrorState } from '@/features/register-v2/components/states/RegistrationV2ErrorState'
import { RegistrationV2FailureState } from '@/features/register-v2/components/states/RegistrationV2FailureState'
import { RegistrationV2LoadingState } from '@/features/register-v2/components/states/RegistrationV2LoadingState'
import { RegistrationV2ReadyState } from '@/features/register-v2/components/states/RegistrationV2ReadyState'
import { RegistrationV2SuccessState } from '@/features/register-v2/components/states/RegistrationV2SuccessState'
import { RegistrationV2TransactionState } from '@/features/register-v2/components/states/RegistrationV2TransactionState'
import { RegistrationV2UnavailableState } from '@/features/register-v2/components/states/RegistrationV2UnavailableState'
import { RegistrationV2UiContext } from '@/features/register-v2/machines/RegistrationV2UiContext'
import { getRegistrationV2ChildActor } from '@/features/register-v2/machines/registrationV2UiMachine'
import { getRegistrationV2AvailabilityQueryOptions } from '@/features/register-v2/queries/registrationV2AvailabilityQueryOptions'
import { normalizeDomainNameFromUrl } from '@/utils/domain'

interface RegistrationV2PageProps {
  routeName: string
}

export const RegistrationV2Page = ({ routeName }: RegistrationV2PageProps) => {
  const targetName = normalizeDomainNameFromUrl(routeName)

  return (
    <RegistrationV2UiContext.Provider key={targetName}>
      <RegistrationV2PageContent targetName={targetName} />
    </RegistrationV2UiContext.Provider>
  )
}

interface RegistrationV2PageContentProps {
  targetName: string
}

function RegistrationV2PageContent({
  targetName,
}: RegistrationV2PageContentProps) {
  const uiActor = RegistrationV2UiContext.useActorRef()

  const uiState = RegistrationV2UiContext.useSelector((state) => state.value)
  const isRegistering = uiState === 'registering'

  const registrationActor = getRegistrationV2ChildActor(uiActor.getSnapshot())

  if (!registrationActor) {
    throw new Error('Registration v2 child actor is not available')
  }

  const registrationStateValue = useSelector(registrationActor, (state) =>
    String(state.value),
  )
  const registrationErrorMessage = useSelector(
    registrationActor,
    (state) => state.context.error?.message,
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

  useEffect(() => {
    if (!isRegistering) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isRegistering])

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

  const availabilityState = availabilityQuery.isPending
    ? 'loading'
    : availabilityQuery.isError
      ? 'error'
      : availabilityQuery.data?.isAvailable === false
        ? 'unavailable'
        : 'available'

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

      {availabilityState === 'loading' && (
        <RegistrationV2LoadingState targetName={targetName} />
      )}

      {availabilityState === 'error' && (
        <RegistrationV2ErrorState
          message={
            availabilityQuery.error instanceof Error
              ? availabilityQuery.error.message
              : 'Failed to load registration data.'
          }
          targetName={targetName}
        />
      )}

      {availabilityState === 'unavailable' && (
        <RegistrationV2UnavailableState
          message={`${targetName} is not available to register.`}
          targetName={targetName}
        />
      )}

      {availabilityState === 'available' && uiState === 'editing' && (
        <RegistrationV2ReadyState targetName={targetName} />
      )}

      {availabilityState === 'available' && uiState === 'registering' && (
        <RegistrationV2TransactionState targetName={targetName} />
      )}

      {availabilityState === 'available' && uiState === 'success' && (
        <RegistrationV2SuccessState targetName={targetName} />
      )}

      {availabilityState === 'available' && uiState === 'failure' && (
        <RegistrationV2FailureState targetName={targetName} />
      )}
    </main>
  )
}
