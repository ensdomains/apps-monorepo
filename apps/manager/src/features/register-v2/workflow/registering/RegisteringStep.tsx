import { JACQUARD_PATTERN6_DYE_BLEED_OPTIONS } from '@ens-apps/weave-loader/presets'
import { useLingui } from '@lingui/react/macro'
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

const WeaveRegistration = lazy(() =>
  import('./components/WeaveRegistration').then((m) => ({
    default: m.WeaveRegistration,
  })),
)
const WeaveProgressBar = lazy(() =>
  import('@ens-apps/weave-loader/WeaveProgressBar').then((m) => ({
    default: m.WeaveProgressBar,
  })),
)

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
    const timer = setInterval(
      () => setCount((c) => (c + 1) % (max + 1)),
      REGISTERING_DOTS_INTERVAL_MS,
    )
    return () => clearInterval(timer)
  }, [max])
  return '.'.repeat(count)
}

const RegisteringTitle = () => {
  const { t } = useLingui()
  const dots = useTrailingDots()
  return (
    <Calligraph
      animation="smooth"
      as="p"
      className="text-base text-ens-blue"
      initial
    >
      {`${t`Registering name`}${dots}`}
    </Calligraph>
  )
}

export const RegisteringStep = () => {
  const { t, i18n } = useLingui()
  const { registrationActor, uiActor, label } = RegisterV2Context.use()
  const registeringTx = useRegisteringTx(registrationActor)
  const uiStage = useRegisteringStage(uiActor)
  const txState = useRegistrationTxState(registeringTx)
  const maxProgress = useMaxProgress(uiActor)

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
    ? t`Waiting for commitment cooldown — register unlocks in ${cooldownSecondsDisplay}s`
    : stageMessages.stageDescription
      ? i18n._(stageMessages.stageDescription)
      : undefined

  const isRegistrationComplete =
    registeringTx.value === 'success' || uiStage?.transaction === 'success'

  const fullName = `${label}.eth`
  const [nameFillSettled, setNameFillSettled] = useState(false)
  const { progress: fillProgress } = useForwardProgress(
    displayedProgress,
    isRegistrationComplete,
    fullName.length,
    isCooldownActive ? cooldownSeconds : null,
  )

  useEffect(() => {
    if (!isRegistrationComplete) {
      setNameFillSettled(false)
    }
  }, [isRegistrationComplete])

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
    isRegistrationComplete && enteredLoaderRef.current && !nameFillSettled

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
        t`Your registration is in progress. Leaving may interrupt it. Are you sure you want to leave?`,
      )

      return !shouldLeave
    },
  })

  if (showCenteredLoader) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 max-md:bg-white">
        <Suspense fallback={<WeaveTrackPlaceholder className="max-w-2xl" />}>
          <WeaveRegistration
            animate={holdForFill}
            description={holdForFill ? undefined : stageDescription}
            name={fullName}
            onFillSettled={() => setNameFillSettled(true)}
            progress={fillProgress}
            weaveOptions={JACQUARD_PATTERN6_DYE_BLEED_OPTIONS}
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
                <RegisteringTitle />
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
              <RegistrationProgressBar label={t`Loading...`} progress={0} />
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
