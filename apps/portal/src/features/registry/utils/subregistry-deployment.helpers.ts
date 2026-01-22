import type {
  CustomTransactionIntent,
  EOATransactionRequest,
} from '@ens-apps/transaction-manager'
import {
  deploySubregistryWriteParameters,
  setSubregistryWriteParameters,
} from '@ensdomains/ensjs/wallet'
import { errAsync, okAsync, type ResultAsync } from 'neverthrow'
import type { Account, Address, Chain, Transport, WalletClient } from 'viem'
import { encodeFunctionData } from 'viem'

type WalletClientWithAccount = WalletClient<Transport, Chain, Account>

interface PrepareDeploySubregistryParams {
  readonly factoryAddress: Address
  readonly implAddress: Address
  readonly walletClient: WalletClient
  readonly chainId: number
}

interface PrepareSetSubregistryParams {
  readonly registryAddress: Address
  readonly label: string
  readonly subregistryAddress: Address
  readonly walletClient: WalletClient
  readonly chainId: number
}

function assertWalletHasAccount(
  walletClient: WalletClient,
): walletClient is WalletClientWithAccount {
  return walletClient.account !== undefined
}

/**
 * Prepares the deploy subregistry transaction request.
 * Returns a CustomTransactionIntent that can be passed to the transaction manager.
 */
export function prepareDeploySubregistryTransaction({
  factoryAddress,
  implAddress,
  walletClient,
  chainId,
}: PrepareDeploySubregistryParams): ResultAsync<
  CustomTransactionIntent,
  Error
> {
  if (!assertWalletHasAccount(walletClient)) {
    return errAsync(new Error('Wallet client has no connected account'))
  }

  const writeParams = deploySubregistryWriteParameters(walletClient, {
    factoryAddress,
    implAddress,
  })

  const data = encodeFunctionData({
    abi: writeParams.abi,
    functionName: writeParams.functionName,
    args: writeParams.args,
  })

  const request: EOATransactionRequest = {
    type: 'eoa',
    from: walletClient.account?.address as Address,
    to: writeParams.address,
    data,
    chainId,
  }

  const intent: CustomTransactionIntent = {
    type: 'custom',
    request,
  }

  return okAsync(intent)
}

/**
 * Prepares the setSubregistry transaction request.
 * This is called after the deploy transaction confirms.
 */
export function prepareSetSubregistryTransaction({
  registryAddress,
  label,
  subregistryAddress,
  walletClient,
  chainId,
}: PrepareSetSubregistryParams): ResultAsync<CustomTransactionIntent, Error> {
  if (!assertWalletHasAccount(walletClient)) {
    return errAsync(new Error('Wallet client has no connected account'))
  }

  const writeParams = setSubregistryWriteParameters(walletClient, {
    registryAddress,
    label,
    subregistryAddress,
  })

  const data = encodeFunctionData({
    abi: writeParams.abi,
    functionName: writeParams.functionName,
    args: writeParams.args,
  })

  const request: EOATransactionRequest = {
    type: 'eoa',
    from: walletClient.account.address,
    to: writeParams.address,
    data,
    chainId,
    gas: 500000n,
  }

  const intent: CustomTransactionIntent = {
    type: 'custom',
    request,
  }

  return okAsync(intent)
}
