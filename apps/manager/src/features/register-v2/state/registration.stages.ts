import type { RegistrationMachineState } from '@ens-apps/transaction-manager'

export type RegistrationStage = Extract<RegistrationMachineState, string>

export const REGISTRATION_STAGE_PROGRESS = {
  idle: 0,
  settingUpRegistration: 5,
  deployingResolver: 8,
  waitingForResolverDeployment: 15,
  preparingCommitment: 23,
  ensuringHcaDeployed: 27,
  // HCA path: resolver-deploy + commit bundled into one Intent. Sits at the
  // same point as the standalone `committingTransaction` step.
  submittingSetupBundle: 31,
  committingTransaction: 31,
  waitingForCommitment: 38,
  fetchingCommitmentAge: 40,
  commitmentCooldown: 44,
  validatingCommitment: 46,
  checkingAllowance: 50,
  signingPermit: 52,
  approvingToken: 54,
  waitingForApproval: 62,
  registeringDomain: 77,
  waitingForRegistration: 90,
  submittingRhinestoneBundle: 55,
  waitingForRhinestoneBundle: 85,
  verifyingRegistration: 95,
  // Voucher (self-pay) path: replaces the multi-step on-chain flow. The
  // stage values only cover the SHORT buyer-side part (sign + mint receipt,
  // ~15-30s); fulfilment is the long tail (~2-3 min: commit txs, 60s
  // commitment cooldown, register) and advances through the REAL backend
  // phases via VOUCHER_FULFILMENT_PHASE_PROGRESS below — a static value here
  // would park the bar for minutes (fulfillingRegistration is just the
  // entry floor).
  mintingVoucher: 15,
  waitingForVoucherMint: 30,
  fulfillingRegistration: 40,
  success: 100,
  error: 0,
} as const satisfies Record<RegistrationStage, number>

/**
 * Progress within `fulfillingRegistration`, keyed by the backend order
 * status the machine's fulfilment poll reports every ~4s. Bands are sized
 * by expected wall time, not step count: `committed` (the fixed ~60s
 * commit-reveal cooldown) and `registering` get the widest berths.
 * Monotonicity is enforced by the consumer (maxProgressReached clamp), so
 * a stale poll can never move the bar backwards.
 */
export const VOUCHER_FULFILMENT_PHASE_PROGRESS: Record<string, number> = {
  pending: 42, // settle verification of the mint receipt in flight
  paid: 48, // payment verified, queued for fulfilment
  committing: 58, // resolver deploy + commitment txs
  committed: 72, // commit-reveal cooldown (~60s)
  registering: 88, // register tx through the Roles modifier
  registered: 100,
}

export function getVoucherFulfilmentPhaseProgress(
  phase: string,
): number | undefined {
  return VOUCHER_FULFILMENT_PHASE_PROGRESS[phase]
}

export function getRegistrationStageProgress(stage: string): number {
  return stage in REGISTRATION_STAGE_PROGRESS
    ? REGISTRATION_STAGE_PROGRESS[stage as RegistrationStage]
    : 0
}

export type MaxProgressReached = {
  stage: RegistrationStage
  progress: number
}
