import { requireChainId } from '@ens-apps/config'
import {
  buildStandaloneHcaDeploymentCall,
  type Call,
} from '@ens-apps/smart-account'
import type { PublicClient } from 'viem'
import type { MigrationPlan } from './buildMigrationPlan'
import { approvalNeedsFor } from './migrationApprovalNeeds'
import {
  buildMigrationApprovalCall,
  type MigrationApproval,
} from './migrationApprovals'

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

/** Fallback for approvals a projected renewal revives but the chain cannot measure yet. */
const FALLBACK_APPROVAL_GAS = 55_000n

type EstimateMigrationGasCostParams = {
  readonly plan: MigrationPlan
  readonly publicClient: PublicClient
  /** Grace renewals only: execution rebuilds the plan after the renewal. */
  readonly budgetUnmeasurableApprovals?: boolean
}

/** Recovery keeps migrated names' token approvals as done steps; execution only sends the remaining ones. */
const approvalsToSend = (plan: MigrationPlan): readonly MigrationApproval[] => {
  const tokenIds = new Set(approvalNeedsFor(plan.groups).unwrappedTokenIds)
  return (plan.preflight.migrationApprovals ?? []).filter(
    (approval) =>
      approval.kind !== 'erc721-token' || tokenIds.has(approval.tokenId),
  )
}

type SetupCall = {
  readonly call: Call
  readonly tokenApproval: boolean
}

/** The setup transactions the owner sends before any batch; the wallet estimates each. */
const setupCalls = (
  plan: MigrationPlan,
  publicClient: PublicClient,
): readonly SetupCall[] => [
  ...(plan.hcaDeploymentRequired
    ? [
        {
          call: buildStandaloneHcaDeploymentCall({
            chainId: requireChainId(publicClient, 'migration'),
            owner: plan.migrationOwner,
          }),
          tokenApproval: false,
        },
      ]
    : []),
  ...approvalsToSend(plan).map((approval) => ({
    call: buildMigrationApprovalCall(approval),
    tokenApproval: approval.kind === 'erc721-token',
  })),
]

const estimateSetupGas = (
  plan: MigrationPlan,
  publicClient: PublicClient,
  budgetUnmeasurableApprovals: boolean,
): Promise<readonly bigint[]> =>
  Promise.all(
    setupCalls(plan, publicClient).map(async ({ call, tokenApproval }) => {
      try {
        return await publicClient.estimateGas({
          account: plan.migrationOwner,
          to: call.to,
          data: call.data,
          value: call.value,
        })
      } catch (error) {
        // BaseRegistrar.ownerOf reverts during grace; the renewal restores it.
        if (!tokenApproval || !budgetUnmeasurableApprovals) throw error
        return FALLBACK_APPROVAL_GAS
      }
    }),
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
  budgetUnmeasurableApprovals = false,
}: EstimateMigrationGasCostParams): Promise<MigrationGasEstimate> => {
  try {
    const [setupGas, feePerGasWei] = await Promise.all([
      estimateSetupGas(plan, publicClient, budgetUnmeasurableApprovals),
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
