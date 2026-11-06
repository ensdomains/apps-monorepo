import type { RegistrationStep } from '@ens-apps/utils/posthog/eventContracts'

/** Groups only user-visible stages; other child snapshots add no milestone. */
export const getRegistrationAnalyticsStep = (
  stage: string,
): RegistrationStep | undefined => {
  const stages: Readonly<Record<string, RegistrationStep>> = {
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
    submittingSetupBundle: 'commit',
    waitingForCommitment: 'commit',
    commitmentCooldown: 'cooldown',
    registeringDomain: 'registration',
    waitingForRegistration: 'registration',
    submittingRhinestoneBundle: 'registration',
    waitingForRhinestoneBundle: 'registration',
    verifyingRegistration: 'verification',
  }
  return stages[stage]
}
