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
    <>
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
    </>
  )
}
