import type { RegistrationStage } from './eventContracts'

/** Groups only user-visible stages; other child snapshots add no milestone. */
export const getRegistrationAnalyticsStep = (
  stage: string,
): RegistrationStage | undefined => {
  const stages: Readonly<Record<string, RegistrationStage>> = {
    settingUpRegistration: 'setup',
    checkingResolver: 'setup',
    deployingResolver: 'setup',
    waitingForResolverDeployment: 'setup',
    signingFundingPermit: 'approval',
    checkingAllowance: 'approval',
    approvingToken: 'approval',
    waitingForApproval: 'approval',
    preparingCommitment: 'commit',
    committingTransaction: 'commit',
    submittingEoaSetupBundle: 'commit',
    submittingSetupBundle: 'commit',
    validatingCommitment: 'commit',
    waitingForCommitment: 'commit',
    commitmentCooldown: 'cooldown',
    registeringDomain: 'registration',
    waitingForRegistration: 'registration',
    submittingRhinestoneBundle: 'registration',
    waitingForRhinestoneBundle: 'registration',
    verifyingRegistration: 'verification',
  }
  return Object.hasOwn(stages, stage) ? stages[stage] : undefined
}
