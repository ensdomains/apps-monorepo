import type { RegistrationMachineState } from '@ens-apps/transaction-manager'

export type RegistrationStage = Extract<RegistrationMachineState, string>

export const REGISTRATION_STAGE_PROGRESS = {
  idle: 0,
  settingUpRegistration: 5,
  deployingResolver: 8,
  waitingForResolverDeployment: 15,
  preparingCommitment: 23,
  committingTransaction: 31,
  waitingForCommitment: 38,
  fetchingCommitmentAge: 40,
  commitmentCooldown: 44,
  validatingCommitment: 46,
  checkingAllowance: 50,
  approvingToken: 54,
  waitingForApproval: 62,
  registeringDomain: 77,
  waitingForRegistration: 90,
  submittingRhinestoneBundle: 55,
  waitingForRhinestoneBundle: 85,
  verifyingRegistration: 95,
  success: 100,
  error: 0,
} as const satisfies Record<RegistrationStage, number>

export function getRegistrationStageProgress(stage: string): number {
  return stage in REGISTRATION_STAGE_PROGRESS
    ? REGISTRATION_STAGE_PROGRESS[stage as RegistrationStage]
    : 0
}

export type MaxProgressReached = {
  stage: RegistrationStage
  progress: number
}
