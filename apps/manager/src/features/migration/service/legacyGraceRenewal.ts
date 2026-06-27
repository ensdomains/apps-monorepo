import {
  type Call,
  ENS_SEPOLIA_CONTRACTS,
  ETH_REGISTRAR_CONTROLLER_ABI,
  REFERER_ADDRESS,
  type Signer,
  type TransactionRequest,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import type { Address, Hex, PublicClient } from 'viem'
import { encodeFunctionData } from 'viem'
import type { RenewableGraceName } from './classifyNames'

type BuildLegacyGraceRenewalCallParams = {
  readonly name: RenewableGraceName
  readonly price: bigint
}

export type LegacyGraceRenewalProgress = {
  readonly current: number
  readonly total: number
  readonly name: string
  readonly description: string
  readonly txHash?: Hex
}

export type LegacyGraceRenewalResult = {
  readonly renewedNames: readonly string[]
  readonly txHashes: readonly Hex[]
}

export type LegacyGraceRenewalEstimate = {
  readonly renewalCostWei: bigint
  readonly gasFeeWei: bigint
  readonly gasUnits: bigint
  readonly transactionCount: number
}

const PENDING_TX_HASH = '0x0' as Hex
const FALLBACK_RENEWAL_GAS_UNITS = 120_000n
const isLocalTestNoopRenewal = (name: RenewableGraceName): boolean =>
  name.renewalMode === 'local-test-noop'

export const buildLegacyGraceRenewalCall = ({
  name,
  price,
}: BuildLegacyGraceRenewalCallParams): Call => ({
  to: ENS_SEPOLIA_CONTRACTS.ETHRegistrarController,
  value: price,
  data: encodeFunctionData({
    abi: ETH_REGISTRAR_CONTROLLER_ABI,
    functionName: 'renew',
    args: [name.label, BigInt(name.renewalDurationSeconds), REFERER_ADDRESS],
  }),
})

export const getLegacyGraceRenewalPrice = async (
  publicClient: PublicClient,
  name: RenewableGraceName,
): Promise<bigint> => {
  const price = await publicClient.readContract({
    address: ENS_SEPOLIA_CONTRACTS.ETHRegistrarController,
    abi: ETH_REGISTRAR_CONTROLLER_ABI,
    functionName: 'rentPrice',
    args: [name.label, BigInt(name.renewalDurationSeconds)],
  })
  return price.base + price.premium
}

const estimateFeePerGas = async (
  publicClient: PublicClient,
): Promise<bigint> => {
  const fees = await publicClient.estimateFeesPerGas()
  if (fees.maxFeePerGas) return fees.maxFeePerGas
  if (fees.gasPrice) return fees.gasPrice
  return publicClient.getGasPrice()
}

const buildEOARequest = (params: {
  readonly accountAddress: Address
  readonly call: Call
  readonly publicClient: PublicClient
}): TransactionRequest => {
  const chainId = params.publicClient.chain?.id
  if (!chainId) throw new Error('publicClient is missing a chain configuration')
  return {
    type: 'eoa',
    from: params.accountAddress,
    to: params.call.to,
    data: params.call.data,
    value: params.call.value,
    chainId,
  }
}

export const estimateLegacyGraceRenewals = async (params: {
  readonly names: readonly RenewableGraceName[]
  readonly accountAddress: Address
  readonly publicClient: PublicClient
}): Promise<LegacyGraceRenewalEstimate> => {
  const feePerGasWei = await estimateFeePerGas(params.publicClient)
  let renewalCostWei = 0n
  let gasUnits = 0n
  let transactionCount = 0

  for (const name of params.names) {
    transactionCount += 1
    const price = await getLegacyGraceRenewalPrice(params.publicClient, name)
    const call = buildLegacyGraceRenewalCall({ name, price })
    renewalCostWei += price
    try {
      gasUnits += await params.publicClient.estimateGas({
        account: params.accountAddress,
        to: call.to,
        data: call.data,
        value: call.value,
      })
    } catch {
      gasUnits += FALLBACK_RENEWAL_GAS_UNITS
    }
  }

  return {
    renewalCostWei,
    gasFeeWei: gasUnits * feePerGasWei,
    gasUnits,
    transactionCount,
  }
}

export const executeLegacyGraceRenewals = async (params: {
  readonly names: readonly RenewableGraceName[]
  readonly signer: Signer
  readonly accountAddress: Address
  readonly publicClient: PublicClient
  readonly onProgress?: (progress: LegacyGraceRenewalProgress) => void
  readonly onNameComplete?: (name: string, txHash: Hex) => void
}): Promise<LegacyGraceRenewalResult> => {
  const { names, signer, accountAddress, publicClient, onProgress } = params
  const renewedNames: string[] = []
  const txHashes: Hex[] = []

  for (const [index, name] of names.entries()) {
    const current = index + 1
    if (isLocalTestNoopRenewal(name)) {
      onProgress?.({
        current,
        total: names.length,
        name: name.domain.name,
        description: `Renew ${name.domain.name}`,
      })
      renewedNames.push(name.domain.name)
      onProgress?.({
        current,
        total: names.length,
        name: name.domain.name,
        description: `Renewed ${name.domain.name}`,
      })
      continue
    }

    onProgress?.({
      current,
      total: names.length,
      name: name.domain.name,
      description: `Preparing renewal for ${name.domain.name}`,
    })
    const price = await getLegacyGraceRenewalPrice(publicClient, name)
    const call = buildLegacyGraceRenewalCall({ name, price })
    const txId = transactionManager.startTransaction(
      {
        type: 'custom',
        request: buildEOARequest({ accountAddress, call, publicClient }),
      },
      signer,
      {
        description: `Renew ${name.domain.name}`,
        publicClient,
      },
    )
    onProgress?.({
      current,
      total: names.length,
      name: name.domain.name,
      description: `Renew ${name.domain.name}`,
      txHash: PENDING_TX_HASH,
    })
    const result = await waitForTransaction(txId)
    const txHash = result.hash as Hex
    renewedNames.push(name.domain.name)
    txHashes.push(txHash)
    params.onNameComplete?.(name.domain.name, txHash)
    onProgress?.({
      current,
      total: names.length,
      name: name.domain.name,
      description: `Renewed ${name.domain.name}`,
      txHash,
    })
  }

  return { renewedNames, txHashes }
}
