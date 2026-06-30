/**
 * Deploy a fresh subregistry (VerifiableFactory proxy) admin'd by the recipient,
 * for use during a name transfer. Returns the deployed registry address so the
 * caller can point the name at it via the parent's `setSubregistry`.
 */

import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { deploySubregistryWriteParameters } from '@ensdomains/ensjs/wallet'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'
import type { WalletClientWithAccount } from '@/utils/types'
import {
  extractDeployedAddress,
  generateResolverSalt,
} from '../utils/proxyDeployment'

export interface DeployRegistryParameters {
  readonly name: string
  /** Admin of the new subregistry — the recipient of the transfer. */
  readonly recipient: Address
  readonly factoryAddress: Address
  readonly implAddress: Address
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
  readonly id: string
}

export interface DeployRegistryResult {
  readonly txId: string
  readonly hash: Hex
  readonly deployedAddress: Address
}

export const deployRegistry = async ({
  name,
  recipient,
  factoryAddress,
  implAddress,
  walletClient,
  publicClient,
  signer,
  chainId,
  id,
}: DeployRegistryParameters): Promise<DeployRegistryResult> => {
  if (!walletClient.account) {
    throw new Error('Wallet client must have account configured')
  }

  const walletWithAccount = walletClient as WalletClientWithAccount

  const writeParams = deploySubregistryWriteParameters(walletWithAccount, {
    factoryAddress,
    implAddress,
    adminAddress: recipient,
    salt: generateResolverSalt(name),
  })

  const data = encodeFunctionData({
    abi: writeParams.abi,
    functionName: writeParams.functionName,
    args: writeParams.args,
  })

  const txId = transactionManager.startTransaction(
    {
      type: 'custom',
      request: {
        type: 'eoa',
        from: walletWithAccount.account.address,
        to: writeParams.address,
        data,
        chainId,
      },
    },
    signer,
    {
      id,
      description: `Deploy registry for ${name}`,
      publicClient,
      timeout: 120_000,
    },
  )

  const result = await waitForTransaction(txId)
  const deployedAddress = extractDeployedAddress(result.receipt)

  if (!deployedAddress) {
    throw new Error('Could not determine the deployed registry address')
  }

  return { txId, hash: result.hash, deployedAddress }
}
