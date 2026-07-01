import { useLingui } from '@lingui/react/macro'
import { useBlocker } from '@tanstack/react-router'
import { useEffect } from 'react'
import { match, P } from 'ts-pattern'
import { useCountdown } from '@/hooks/useCountdown'
import { RegisterV2Context } from '../../state/registrationUi.context'
import { useRegisteringStage } from '../../state/registrationUi.selectors'
import { CenteredWeaveLoader } from './components/CenteredWeaveLoader'
import { NotificationSettings } from './components/NotificationSettings'
import { RegisteringHeader } from './components/RegisteringHeader'
import { RegistrationDetails } from './components/RegistrationDetails'
import { useRegisteringCompletion } from './hooks/useRegisteringCompletion'
import { getRegistrationStageMessages } from './lib/txStageMessages'
import { useRegistrationTxState } from './lib/txState'

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

export interface RegisteringStepProps {
  fillProgress: number
  fillDone: boolean
  isRegistrationComplete: boolean
  /** Parent latch — user dismissed notification settings and entered the weave flow. */
  sawWeaveFlow?: boolean
  onWeaveFlowEntered?: () => void
  /** Fired after fill progress reaches 100% and the completion beat finishes. */
  onCompletionAnimationFinished?: () => void
}

export const RegisteringStep = ({
  fillProgress,
  fillDone,
  isRegistrationComplete,
  sawWeaveFlow = false,
  onWeaveFlowEntered,
  onCompletionAnimationFinished,
}: RegisteringStepProps) => {
  const { t, i18n } = useLingui()
  const { registrationActor, uiActor, label } = RegisterV2Context.use()
  const registeringTx = useRegisteringTx(registrationActor)
  const uiStage = useRegisteringStage(uiActor)
  const txState = useRegistrationTxState(registeringTx)
  const maxProgress = useMaxProgress(uiActor)

  const displayedStage = maxProgress?.stage ?? registeringTx.value
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

  const notificationsCompleted = uiStage?.notifications === 'completed'
  const showWeaveLoader =
    !isRegistrationComplete &&
    notificationsCompleted &&
    uiStage?.transaction === 'pending'

  // Single source of truth for entering the weave flow: the notifications step
  // reaching `completed` (a superset of the loader being shown, and the state
  // that `advanceNotificationsStep` transitions into).
  useEffect(() => {
    if (notificationsCompleted) {
      onWeaveFlowEntered?.()
    }
  }, [notificationsCompleted, onWeaveFlowEntered])

  const fullName = `${label}.eth`
  const { exitLoaderReady } = useRegisteringCompletion({
    isRegistrationComplete,
    sawWeaveFlow,
    fillDone,
    onCompletionAnimationFinished,
  })

  const holdForFill = isRegistrationComplete && sawWeaveFlow && !exitLoaderReady
  const showCenteredLoader = showWeaveLoader || holdForFill

  const advanceNotificationsStep = () => {
    uiActor.send({ type: 'notifications.step.next' })
  }

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
      <CenteredWeaveLoader
        description={holdForFill ? undefined : stageDescription}
        name={fullName}
        progress={fillProgress}
      />
    )
  }

  return (
    <div className="h-full space-y-6 pb-4 max-md:bg-white md:space-y-4 md:pt-5">
      <div className="mx-auto max-w-6xl pt-3 md:w-full-[32px]">
        <RegisteringHeader
          fillProgress={fillProgress}
          isRegistrationComplete={isRegistrationComplete}
          uiStage={uiStage}
        />
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
