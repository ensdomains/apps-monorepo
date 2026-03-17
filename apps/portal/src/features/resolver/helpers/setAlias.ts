import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import {
  deleteAliasWriteParameters,
  setAliasWriteParameters,
} from '@ensdomains/ensjs/wallet/v2'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'

export interface SetAliasParameters {
  readonly fromName: string
  readonly toName: string
  readonly resolverAddress: Address
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
}

export interface SetAliasResult {
  readonly txId: string
  readonly hash: Hex
}

export const setAlias = async (
  params: SetAliasParameters,
): Promise<SetAliasResult> => {
  const {
    fromName,
    toName,
    resolverAddress,
    walletClient,
    publicClient,
    signer,
    chainId,
  } = params

  if (!walletClient.account || !walletClient.chain) {
    throw new Error('Wallet client must have account and chain configured')
  }

  const client = walletClient as Parameters<typeof setAliasWriteParameters>[0]

  const writeParams = setAliasWriteParameters(client, {
    fromName,
    toName,
    resolverAddress,
  })

  const data = encodeFunctionData({
    abi: writeParams.abi,
    functionName: writeParams.functionName,
    args: writeParams.args,
  } as Parameters<typeof encodeFunctionData>[0])

  const txId = transactionManager.startTransaction(
    {
      type: 'custom',
      request: {
        type: 'eoa',
        from: walletClient.account.address,
        to: resolverAddress,
        data,
        value: 0n,
        chainId,
      },
    },
    signer,
    {
      description: `Set alias ${fromName} → ${toName}`,
      publicClient,
      chainId,
    },
  )

  const result = await waitForTransaction(txId)

  return {
    txId,
    hash: result.hash,
  }
}

export interface DeleteAliasParameters {
  readonly fromName: string
  readonly resolverAddress: Address
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
}

export const deleteAlias = async (
  params: DeleteAliasParameters,
): Promise<SetAliasResult> => {
  const {
    fromName,
    resolverAddress,
    walletClient,
    publicClient,
    signer,
    chainId,
  } = params

  if (!walletClient.account || !walletClient.chain) {
    throw new Error('Wallet client must have account and chain configured')
  }

  const client = walletClient as Parameters<
    typeof deleteAliasWriteParameters
  >[0]

  const writeParams = deleteAliasWriteParameters(client, {
    fromName,
    resolverAddress,
  })

  const data = encodeFunctionData({
    abi: writeParams.abi,
    functionName: writeParams.functionName,
    args: writeParams.args,
  } as Parameters<typeof encodeFunctionData>[0])

  const txId = transactionManager.startTransaction(
    {
      type: 'custom',
      request: {
        type: 'eoa',
        from: walletClient.account.address,
        to: resolverAddress,
        data,
        value: 0n,
        chainId,
      },
    },
    signer,
    {
      description: `Delete alias ${fromName}`,
      publicClient,
      chainId,
    },
  )

  const result = await waitForTransaction(txId)

  return {
    txId,
    hash: result.hash,
  }
}
