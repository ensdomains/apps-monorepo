import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react'
import { useBlocker } from '@tanstack/react-router'
import { Calligraph } from 'calligraph'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { match, P } from 'ts-pattern'
import { useCountdown } from '@/hooks/useCountdown'
import { RegisterV2Context } from '../../state/registrationUi.context'
import { useRegisteringStage } from '../../state/registrationUi.selectors'
import { NotificationSettings } from './components/NotificationSettings'
import { RegistrationCompletionBanner } from './components/RegistrationCompletionBanner'
import { RegistrationDetails } from './components/RegistrationDetails'
import { RegistrationProgressBar } from './components/RegistrationProgressBar'
import { getRegistrationStageMessages } from './lib/txStageMessages'
import { useRegistrationTxState } from './lib/txState'
import { useForwardProgress } from './lib/useForwardProgress'

// The WebGL weave loader (and its shader) is only needed once a registration tx
// is actually pending. Lazy-load it so the route doesn't pay for the shader
// while the user is still on notification settings / idle.
const WeaveRegistration = lazy(() =>
  import('./components/WeaveRegistration').then((m) => ({
    default: m.WeaveRegistration,
  })),
)
const WeaveProgressBar = lazy(() =>
  import('@/components/WeaveLoader/WeaveProgressBar').then((m) => ({
    default: m.WeaveProgressBar,
  })),
)

/** Lightweight CSS-only stand-in shown while the weave chunk loads. */
function WeaveTrackPlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={`h-3 w-full rounded-full bg-ens-gray-two ${className ?? ''}`}
    />
  )
}

const useRegisteringTx = RegisterV2Context.createTxSelector((state) => ({
  value: state?.value ?? 'idle',
  resolverTxId: state?.context.resolverTxId,
  commitmentTxId: state?.context.commitmentTxId,
  approvalTxId: state?.context.approvalTxId,
  registrationTxId: state?.context.registrationTxId,
  registerReadyTimestamp: state?.context.registerReadyTimestamp ?? null,
}))

const useMaxProgress = RegisterV2Context.createSelector(
  (state) => state.context.maxProgressReached ?? null,
)

const REGISTERING_DOTS_INTERVAL_MS = 700

const useTrailingDots = (max = 3) => {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const t = setInterval(
      () => setCount((c) => (c + 1) % (max + 1)),
      REGISTERING_DOTS_INTERVAL_MS,
    )
    return () => clearInterval(t)
  }, [max])
  return '.'.repeat(count)
}

export const RegisteringStep = () => {
  const { _ } = useLingui()
  const { registrationActor, uiActor, label } = RegisterV2Context.use()
  const registeringTx = useRegisteringTx(registrationActor)
  const uiStage = useRegisteringStage(uiActor)
  const txState = useRegistrationTxState(registeringTx)
  const maxProgress = useMaxProgress(uiActor)
  const registeringDots = useTrailingDots()

  const displayedStage = maxProgress?.stage ?? registeringTx.value
  const displayedProgress = maxProgress?.progress ?? 0
  const stageMessages = getRegistrationStageMessages(
    { ...registeringTx, value: displayedStage },
    txState,
  )

  const { remainingSeconds: cooldownSeconds, isActive: isCooldownActive } =
    useCountdown(registeringTx.registerReadyTimestamp)
  const cooldownSecondsDisplay = cooldownSeconds ?? 0
  const stageDescription = isCooldownActive
    ? _(
        msg`Waiting for commitment cooldown — register unlocks in ${cooldownSecondsDisplay}s`,
      )
    : stageMessages.stageDescription
      ? _(stageMessages.stageDescription)
      : undefined

  const isRegistrationComplete =
    registeringTx.value === 'success' || uiStage?.transaction === 'success'

  const fullName = `${label}.eth`
  const { progress: fillProgress, fillDone } = useForwardProgress(
    displayedProgress,
    isRegistrationComplete,
    fullName.length,
    isCooldownActive ? cooldownSeconds : null,
  )

  const advanceNotificationsStep = () => {
    uiActor.send({ type: 'notifications.step.next' })
  }

  const showWeaveLoader =
    !isRegistrationComplete &&
    uiStage?.notifications === 'completed' &&
    uiStage?.transaction === 'pending'

  const enteredLoaderRef = useRef(false)
  useEffect(() => {
    if (showWeaveLoader) enteredLoaderRef.current = true
  }, [showWeaveLoader])

  const holdForFill =
    isRegistrationComplete && enteredLoaderRef.current && !fillDone

  const showCenteredLoader = showWeaveLoader || holdForFill

  useBlocker({
    shouldBlockFn: () => {
      if (isRegistrationComplete) {
        return false
      }
      if (uiStage?.transaction !== 'pending') {
        return false
      }

      const shouldLeave = confirm(
        _(
          msg`Your registration is in progress. Leaving may interrupt it. Are you sure you want to leave?`,
        ),
      )

      return !shouldLeave
    },
  })

  if (showCenteredLoader) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 max-md:bg-white">
        <Suspense fallback={<WeaveTrackPlaceholder className="max-w-2xl" />}>
          <WeaveRegistration
            animate={false}
            description={holdForFill ? undefined : stageDescription}
            name={fullName}
            progress={fillProgress}
          />
        </Suspense>
      </div>
    )
  }

  return (
    <div className="h-full space-y-6 pb-4 max-md:bg-white md:space-y-4 md:pt-5">
      <div className="mx-auto max-w-6xl pt-3 md:w-full-[32px]">
        {isRegistrationComplete ? (
          <RegistrationCompletionBanner />
        ) : (
          match(uiStage?.transaction)
            .with('pending', () => (
              <div className="flex w-full flex-col items-center gap-2 text-center max-md:px-3">
                <Calligraph
                  animation="smooth"
                  as="p"
                  className="text-base text-ens-blue"
                  initial
                >
                  {`${_(msg`Registering name`)}${registeringDots}`}
                </Calligraph>
                <Suspense
                  fallback={<WeaveTrackPlaceholder className="max-w-2xl" />}
                >
                  <WeaveProgressBar
                    animate={false}
                    className="w-full max-w-2xl"
                    progress={fillProgress / 100}
                  />
                </Suspense>
              </div>
            ))
            .with('success', () => <RegistrationCompletionBanner />)
            .with(undefined, () => (
              <RegistrationProgressBar
                label={_(msg`Loading...`)}
                progress={0}
              />
            ))
            .exhaustive()
        )}
      </div>
      <div className="mx-auto w-full-[32px] max-w-6xl space-y-6.5">
        {match(uiStage)
          .with({ notifications: 'settings' }, () => (
            <NotificationSettings
              onConfirm={advanceNotificationsStep}
              onSkip={advanceNotificationsStep}
            />
          ))
          .with({ transaction: P.string }, () => <RegistrationDetails />)
          .otherwise(() => null)}
      </div>
    </div>
  )
}
