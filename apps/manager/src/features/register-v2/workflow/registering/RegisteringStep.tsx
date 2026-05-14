import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react'
import { useBlocker } from '@tanstack/react-router'
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

export const RegisteringStep = () => {
  const { _ } = useLingui()
  const { registrationActor, uiActor } = RegisterV2Context.use()
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
    ? _(
        msg`Waiting for commitment cooldown — register unlocks in ${cooldownSecondsDisplay}s`,
      )
    : stageMessages.stageDescription
      ? _(stageMessages.stageDescription)
      : undefined

  // Child machine success can arrive before the UI actor reflects it.
  const isRegistrationComplete =
    registeringTx.value === 'success' || uiStage?.transaction === 'success'
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
        _(
          msg`Your registration is in progress. Leaving may interrupt it. Are you sure you want to leave?`,
        ),
      )

      return !shouldLeave
    },
  })

  return (
    <div className="h-full space-y-6 pb-4 max-md:bg-white md:space-y-4 md:pt-5">
      <div className="mx-auto max-w-6xl pt-3 md:w-full-[32px]">
        {isRegistrationComplete ? (
          <RegistrationCompletionBanner />
        ) : (
          match(uiStage?.transaction)
            .with('pending', () => (
              <RegistrationProgressBar
                description={stageDescription}
                label={_(stageMessages.stageLabel)}
                progress={displayedProgress}
              />
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
