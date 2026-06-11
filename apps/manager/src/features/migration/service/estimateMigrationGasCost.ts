import { type Address, namehash, type PublicClient } from 'viem'
import {
  GRANT_ROLES_GAS,
  MULTICALL_OVERHEAD,
  SETADDR_GAS,
  SETTEXT_GAS,
} from './batchMigrate.constants'
import type { MigrationPlan } from './buildMigrationPlan'
import { profileMapKey } from './fetchV1Profiles'

const APPROVAL_GAS = 55_000n
const OWNED_RESOLVER_SETUP_GAS = 220_000n

export type MigrationGasEstimate =
  | {
      readonly status: 'ready'
      readonly gasUnits: bigint
      readonly feeWei: bigint
      readonly feePerGasWei: bigint
      readonly transactionCount: number
    }
  | {
      readonly status: 'error'
      readonly error: unknown
    }

type EstimateMigrationGasCostParams = {
  readonly plan: MigrationPlan
  readonly publicClient: PublicClient
  readonly account: Address
}

const predictedProfileReplayGas = (plan: MigrationPlan): bigint => {
  if (plan.profileReplayCalls.length === 0) return 0n

  let recordGas = 0n
  for (const name of plan.classified) {
    if (name.resolverStrategy !== 'to-owned-permres') continue
    const profile = plan.profiles.get(profileMapKey(namehash(name.domain.name)))
    if (!profile) continue
    recordGas += BigInt(profile.texts.length) * SETTEXT_GAS
    recordGas += BigInt(profile.addresses.length) * SETADDR_GAS
  }
  return BigInt(plan.profileReplayCalls.length) * MULTICALL_OVERHEAD + recordGas
}

const predictedGasUnits = (plan: MigrationPlan): bigint => {
  let gas = 0n
  for (const step of plan.stepDescriptors) {
    if (step.type === 'approve-base-registrar') {
      gas += APPROVAL_GAS
    }
    if (step.type === 'approve-name-wrapper') {
      gas += APPROVAL_GAS
    }
    if (step.type === 'ensure-resolver') {
      gas += OWNED_RESOLVER_SETUP_GAS
    }
  }
  gas += plan.batches.reduce((total, batch) => total + batch.estimatedGas, 0n)
  gas += BigInt(plan.roleGrantCalls.length) * GRANT_ROLES_GAS
  gas += predictedProfileReplayGas(plan)
  return gas
}

const predictedTransactionCount = (plan: MigrationPlan): number => {
  const setupSteps = plan.stepDescriptors.filter(
    (step) =>
      step.type === 'approve-base-registrar' ||
      step.type === 'approve-name-wrapper' ||
      step.type === 'ensure-resolver',
  ).length
  return (
    setupSteps +
    plan.migrateCalls.length +
    plan.roleGrantCalls.length +
    plan.profileReplayCalls.length
  )
}

const estimateFeePerGas = async (
  publicClient: PublicClient,
): Promise<bigint> => {
  const fees = await publicClient.estimateFeesPerGas()
  if (fees.maxFeePerGas) return fees.maxFeePerGas
  if (fees.gasPrice) return fees.gasPrice
  return publicClient.getGasPrice()
}

export const estimateMigrationGasCost = async ({
  plan,
  publicClient,
}: EstimateMigrationGasCostParams): Promise<MigrationGasEstimate> => {
  try {
    const gasUnits = predictedGasUnits(plan)
    const feePerGasWei = await estimateFeePerGas(publicClient)

    return {
      status: 'ready',
      gasUnits,
      feeWei: gasUnits * feePerGasWei,
      feePerGasWei,
      transactionCount: predictedTransactionCount(plan),
    }
  } catch (error) {
    return { status: 'error', error }
  }
}
