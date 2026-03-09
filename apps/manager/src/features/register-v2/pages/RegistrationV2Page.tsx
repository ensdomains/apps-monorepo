import { useEffect } from 'react'
import { useActorRef, useSelector } from '@xstate/react'
import { sepolia } from 'viem/chains'
import { RegistrationV2View } from '@/features/register-v2/components/RegistrationV2View'
import {
  getRegistrationV2ChildActor,
  registrationV2UiMachine,
} from '@/features/register-v2/machines/registrationV2UiMachine'
import { useRegistrationAvailabilityQuery } from '@/features/register-v2/queries/useRegistrationAvailabilityQuery'
import { useRegistrationPricingQuoteQuery } from '@/features/register-v2/queries/useRegistrationPricingQuoteQuery'
import { normalizeDomainNameFromUrl } from '@/utils/domain'

interface RegistrationV2PageProps {
  routeName: string
}

export const RegistrationV2Page = ({
  routeName,
}: RegistrationV2PageProps) => {
  const targetName = normalizeDomainNameFromUrl(routeName)

  const uiActor = useActorRef(registrationV2UiMachine, {
    input: {
      chainId: sepolia.id,
    },
  })

  useEffect(() => {
    uiActor.send({ type: 'TARGET_CHANGED', targetName })
  }, [targetName, uiActor])

  const uiState = useSelector(uiActor, (state) => state.value)
  const durationYears = useSelector(
    uiActor,
    (state) => state.context.durationYears,
  )
  const selectedToken = useSelector(
    uiActor,
    (state) => state.context.selectedToken,
  )

  const availabilityQuery = useRegistrationAvailabilityQuery(targetName)
  const pricingQuery = useRegistrationPricingQuoteQuery({
    routeName: targetName,
    durationYears,
  })

  const registrationActorState = useSelector(uiActor, (state) => {
    const registrationActor = getRegistrationV2ChildActor(state)
    const actorSnapshot = registrationActor?.getSnapshot()

    return actorSnapshot?.value != null ? String(actorSnapshot.value) : 'idle'
  })

  const availabilityState = availabilityQuery.isPending
    ? 'loading'
    : availabilityQuery.isError
      ? 'error'
      : availabilityQuery.data?.isAvailable === false
        ? 'unavailable'
        : 'available'

  const pricingText = pricingQuery.isPending
    ? 'Pricing scaffold loading...'
    : pricingQuery.data?.isOk() && pricingQuery.data.value.usdc
      ? `Current quote scaffold: ${pricingQuery.data.value.usdc.formatted} USDC for ${durationYears} year${durationYears > 1 ? 's' : ''}.`
      : 'Pricing scaffold available but not yet rendered in detail.'

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

      <RegistrationV2View
        availabilityMessage={
          availabilityQuery.error instanceof Error
            ? availabilityQuery.error.message
            : availabilityQuery.data?.isAvailable === false
              ? `${targetName} is not available to register.`
              : undefined
        }
        availabilityState={availabilityState}
        durationYears={durationYears}
        onSetDuration={(nextDurationYears) =>
          uiActor.send({
            type: 'DURATION_SET',
            durationYears: nextDurationYears,
          })
        }
        onSetToken={(token) => uiActor.send({ type: 'TOKEN_SET', token })}
        pricingText={pricingText}
        registrationActorState={registrationActorState}
        selectedToken={selectedToken}
        targetName={targetName}
        uiState={uiState}
      />
    </main>
  )
}
