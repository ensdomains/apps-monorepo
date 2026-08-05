import type { PublicClient } from 'viem'
import type { MigrationPlan } from './buildMigrationPlan'

const APPROVAL_GAS = 55_000n
const APPROVAL_CLEANUP_GAS = 55_000n
// The same standalone HCA deployment used by registration consumes ~393k gas
// on Sepolia. Keep a conservative margin for the owner-paid factory call.
const HCA_DEPLOYMENT_GAS = 450_000n

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
}

const predictedGasUnits = (plan: MigrationPlan): bigint => {
  const approvalCount = BigInt(plan.preflight.migrationApprovals?.length ?? 0)
  const deploymentGas = plan.hcaDeploymentRequired ? HCA_DEPLOYMENT_GAS : 0n
  const approvalLifecycleGas =
    approvalCount * (APPROVAL_GAS + APPROVAL_CLEANUP_GAS)
  const atomicBatchGas = plan.atomicBatches.reduce(
    (total, batch) => total + batch.estimatedGas,
    0n,
  )

  return deploymentGas + approvalLifecycleGas + atomicBatchGas
}

const predictedTransactionCount = (plan: MigrationPlan): number => {
  const approvalCount = plan.preflight.migrationApprovals?.length ?? 0
  const deploymentCount = plan.hcaDeploymentRequired ? 1 : 0
  return (
    deploymentCount + approvalCount + plan.atomicBatches.length + approvalCount
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
