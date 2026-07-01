/**
 * Deploy a fresh dedicated resolver (VerifiableFactory proxy) admin'd by the
 * recipient, for use during a name transfer. Returns the deployed resolver
 * address so the caller can point the name at it via `setNameResolver`.
 */

import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { deployVerifiableProxyWriteParameters } from '@ensdomains/ensjs/wallet'
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
  generateProxySalt,
  getResolverInitCalldata,
} from '../utils/proxyDeployment'

export interface DeployResolverParameters {
  readonly name: string
  /** Admin of the new resolver — the recipient of the transfer. */
  readonly recipient: Address
  readonly factoryAddress: Address
  readonly implAddress: Address
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
  readonly id: string
}

export interface DeployResolverResult {
  readonly txId: string
  readonly hash: Hex
  readonly deployedAddress: Address
}

export const deployResolver = async ({
  name,
  recipient,
  factoryAddress,
  implAddress,
  walletClient,
  publicClient,
  signer,
  chainId,
  id,
}: DeployResolverParameters): Promise<DeployResolverResult> => {
  if (!walletClient.account) {
    throw new Error('Wallet client must have account configured')
  }

  const walletWithAccount = walletClient as WalletClientWithAccount

  const writeParams = deployVerifiableProxyWriteParameters(walletWithAccount, {
    factoryAddress,
    implAddress,
    callData: getResolverInitCalldata(recipient),
    salt: generateProxySalt(name),
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
      description: `Deploy resolver for ${name}`,
      publicClient,
      timeout: 120_000,
    },
  )

  const result = await waitForTransaction(txId)
  const deployedAddress = extractDeployedAddress(result.receipt)

  if (!deployedAddress) {
    throw new Error('Could not determine the deployed resolver address')
  }

  return { txId, hash: result.hash, deployedAddress }
}
