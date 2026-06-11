import type { Call } from '@ens-apps/transaction-manager'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import type { Address, PublicClient } from 'viem'
import { encodeFunctionData } from 'viem'
import { sepoliaWithEns } from '@/lib/wagmi'
import {
  BASE_REGISTRAR_ABI,
  NAME_WRAPPER_ABI,
  VERIFIABLE_FACTORY_ABI,
} from '../contracts/abis'
import { V2_CONTRACTS } from '../contracts/addresses'
import {
  computeOwnedResolverSalt,
  getOwnedPermResInitCalldata,
} from '../contracts/permissionedResolverAddress'
import type { MigrationPlan } from './buildMigrationPlan'

const BASE_REGISTRAR = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensBaseRegistrarImplementation',
})
const NAME_WRAPPER = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensNameWrapper',
})

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

type EstimableCall = {
  readonly call: Call
  readonly fallbackGas?: bigint
}

const approvalCall = (to: Address): Call => ({
  to,
  data: encodeFunctionData({
    abi: BASE_REGISTRAR_ABI,
    functionName: 'setApprovalForAll',
    args: [V2_CONTRACTS.MigrationHelper, true],
  }),
  value: 0n,
})

const nameWrapperApprovalCall = (): Call => ({
  to: NAME_WRAPPER,
  data: encodeFunctionData({
    abi: NAME_WRAPPER_ABI,
    functionName: 'setApprovalForAll',
    args: [V2_CONTRACTS.MigrationHelper, true],
  }),
  value: 0n,
})

const resolverSetupCall = (account: Address): Call => ({
  to: V2_CONTRACTS.VerifiableFactory,
  data: encodeFunctionData({
    abi: VERIFIABLE_FACTORY_ABI,
    functionName: 'deployProxy',
    args: [
      V2_CONTRACTS.PermissionedResolverImpl,
      computeOwnedResolverSalt(account, 0n),
      getOwnedPermResInitCalldata(account),
    ],
  }),
  value: 0n,
})

const callsForPlan = (
  plan: MigrationPlan,
  account: Address,
): EstimableCall[] => {
  const calls: EstimableCall[] = []
  for (const step of plan.stepDescriptors) {
    if (step.type === 'approve-base-registrar') {
      calls.push({ call: approvalCall(BASE_REGISTRAR) })
    }
    if (step.type === 'approve-name-wrapper') {
      calls.push({ call: nameWrapperApprovalCall() })
    }
    if (step.type === 'ensure-resolver') {
      calls.push({ call: resolverSetupCall(account) })
    }
  }
  calls.push(
    ...plan.migrateCalls.map((call, index) => ({
      call,
      fallbackGas: plan.batches[index]?.estimatedGas,
    })),
    ...plan.roleGrantCalls.map((call) => ({ call })),
    ...plan.profileReplayCalls.map((call) => ({ call })),
  )
  return calls
}

const estimateCallGas = async (
  publicClient: PublicClient,
  account: Address,
  estimable: EstimableCall,
): Promise<bigint> => {
  try {
    return await publicClient.estimateGas({
      account,
      to: estimable.call.to,
      data: estimable.call.data,
      value: estimable.call.value,
    })
  } catch (error) {
    if (estimable.fallbackGas) return estimable.fallbackGas
    throw error
  }
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
  account,
}: EstimateMigrationGasCostParams): Promise<MigrationGasEstimate> => {
  try {
    const calls = callsForPlan(plan, account)
    const estimates = await Promise.all(
      calls.map((call) => estimateCallGas(publicClient, account, call)),
    )
    const gasUnits = estimates.reduce((total, gas) => total + gas, 0n)
    const feePerGasWei = await estimateFeePerGas(publicClient)

    return {
      status: 'ready',
      gasUnits,
      feeWei: gasUnits * feePerGasWei,
      feePerGasWei,
      transactionCount: calls.length,
    }
  } catch (error) {
    return { status: 'error', error }
  }
}
