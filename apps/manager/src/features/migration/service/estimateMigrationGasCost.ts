import { requireChainId } from '@ens-apps/config'
import {
  buildStandaloneHcaDeploymentCall,
  type Call,
} from '@ens-apps/smart-account'
import type { PublicClient } from 'viem'
import type { MigrationPlan } from './buildMigrationPlan'
import { buildMigrationApprovalCall } from './migrationApprovals'

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

/** The setup transactions the owner sends before any batch; the wallet estimates each. */
const setupCalls = (
  plan: MigrationPlan,
  publicClient: PublicClient,
): readonly Call[] => [
  ...(plan.hcaDeploymentRequired
    ? [
        buildStandaloneHcaDeploymentCall({
          chainId: requireChainId(publicClient, 'migration'),
          owner: plan.migrationOwner,
        }),
      ]
    : []),
  ...(plan.preflight.migrationApprovals ?? []).map(buildMigrationApprovalCall),
]

const estimateSetupGas = (
  plan: MigrationPlan,
  publicClient: PublicClient,
): Promise<readonly bigint[]> =>
  Promise.all(
    setupCalls(plan, publicClient).map((call) =>
      publicClient.estimateGas({
        account: plan.migrationOwner,
        to: call.to,
        data: call.data,
        value: call.value,
      }),
    ),
  )

const predictedGasUnits = (
  plan: MigrationPlan,
  setupGas: readonly bigint[],
): bigint => {
  const setupGasTotal = setupGas.reduce((total, gas) => total + gas, 0n)
  const atomicBatchGas = plan.atomicBatches.reduce(
    (total, batch) => total + batch.estimatedGas + batch.walletEstimatedGas,
    0n,
  )

  return setupGasTotal + atomicBatchGas
}

const predictedTransactionCount = (plan: MigrationPlan): number => {
  // Bundled steps share one confirmation; the descriptors already group them.
  if (plan.canBatchAtomically) return plan.stepDescriptors.length
  const approvals = plan.preflight.migrationApprovals ?? []
  const approvalCount = approvals.length
  const deploymentCount = plan.hcaDeploymentRequired ? 1 : 0
  const walletReplayCount = plan.atomicBatches.filter(
    (batch) => batch.walletCall,
  ).length
  return (
    deploymentCount +
    approvalCount +
    plan.atomicBatches.length +
    walletReplayCount
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
    const [setupGas, feePerGasWei] = await Promise.all([
      estimateSetupGas(plan, publicClient),
      estimateFeePerGas(publicClient),
    ])
    const gasUnits = predictedGasUnits(plan, setupGas)

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
