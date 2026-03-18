import { useBlocker } from '@tanstack/react-router'
import { match, P } from 'ts-pattern'
import { RegisterV2Context } from '../../state/registrationUi.context'
import { useRegisteringStage } from '../../state/registrationUi.selectors'
import { NotificationSettingsStep } from './components/NotificationSettingsStep'
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
}))

export const RegisteringStep = () => {
  const { registrationActor, uiActor } = RegisterV2Context.use()
  const registeringTx = useRegisteringTx(registrationActor)
  const uiStage = useRegisteringStage(uiActor)
  const txState = useRegistrationTxState(registeringTx)
  const stageMessages = getRegistrationStageMessages(registeringTx, txState)

  useBlocker({
    shouldBlockFn: () => {
      if (uiStage?.transaction !== 'pending') {
        return false
      }

      const shouldLeave = confirm(
        'Your registration is in progress. Leaving may interrupt it. Are you sure you want to leave?',
      )

      return !shouldLeave
    },
  })

  return (
    <div className="h-full space-y-6 pb-4 max-md:bg-white md:space-y-4 md:pt-5">
      <div className="mx-auto max-w-6xl pt-3 md:w-full-[32px]">
        {match(uiStage?.transaction)
          .with('pending', () => (
            <RegistrationProgressBar
              description={stageMessages.stageDescription}
              label={stageMessages.stageLabel}
              progress={stageMessages.progress}
            />
          ))
          .with('success', () => <RegistrationCompletionBanner />)
          .with(undefined, () => (
            <RegistrationProgressBar label="Loading..." progress={0} />
          ))
          .exhaustive()}
      </div>
      <div className="mx-auto w-full-[32px] max-w-6xl space-y-6.5">
        {match(uiStage)
          .with({ notifications: 'settings' }, () => (
            <NotificationSettingsStep
              onConfirm={() => {
                uiActor.send({ type: 'notifications.step.next' })
              }}
              onSkip={() => {
                uiActor.send({ type: 'notifications.step.next' })
              }}
            />
          ))
          .with({ transaction: P.string }, () => <RegistrationDetails />)
          .otherwise(() => null)}
      </div>
    </div>
  )
}
