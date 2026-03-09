import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RegistrationV2ErrorState } from '@/features/register-v2/components/states/RegistrationV2ErrorState'
import { RegistrationV2LoadingState } from '@/features/register-v2/components/states/RegistrationV2LoadingState'
import { RegistrationV2ReadyState } from '@/features/register-v2/components/states/RegistrationV2ReadyState'
import { RegistrationV2SuccessState } from '@/features/register-v2/components/states/RegistrationV2SuccessState'
import { RegistrationV2TransactionState } from '@/features/register-v2/components/states/RegistrationV2TransactionState'
import { RegistrationV2UnavailableState } from '@/features/register-v2/components/states/RegistrationV2UnavailableState'
import { RegistrationV2UiContext } from '@/features/register-v2/machines/RegistrationV2UiContext'
import { getRegistrationV2AvailabilityQueryOptions } from '@/features/register-v2/queries/registrationV2AvailabilityQueryOptions'
import { normalizeDomainNameFromUrl } from '@/utils/domain'

interface RegistrationV2PageProps {
  routeName: string
}

export const RegistrationV2Page = ({
  routeName,
}: RegistrationV2PageProps) => {
  const targetName = normalizeDomainNameFromUrl(routeName)

  return (
    <RegistrationV2UiContext.Provider>
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
  useEffect(() => {
    uiActor.send({ type: 'TARGET_CHANGED', targetName })
  }, [targetName, uiActor])

  const uiState = RegistrationV2UiContext.useSelector((state) => state.value)
  const lastErrorMessage = RegistrationV2UiContext.useSelector(
    (state) => state.context.lastErrorMessage,
  )
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
        <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
          registration-v2 route scaffold
        </p>
        <p className="text-sm text-muted-foreground">
          Target name comes from the route. Query state stays in React Query.
          Transaction execution is scaffolded through a child registration actor.
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
        <RegistrationV2ErrorState
          message={lastErrorMessage ?? 'Registration failed.'}
          targetName={targetName}
        />
      )}
    </main>
  )
}
