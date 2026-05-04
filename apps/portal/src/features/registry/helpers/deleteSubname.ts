import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { deleteSubnameV2WriteParameters } from '@ensdomains/ensjs/wallet/v2'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'

export interface DeleteSubnameParameters {
  /** The full subname (e.g., 'cold.domico.eth') – used for tx description */
  readonly name: string
  /** The label of the subname (e.g., 'cold' for cold.domico.eth) */
  readonly label: string
  /** The parent registry (subregistry) address that manages this subname */
  readonly registryAddress: Address
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
}

export interface DeleteSubnameResult {
  txId: string
  hash: Hex
}

export const deleteSubname = async (
  params: DeleteSubnameParameters,
): Promise<DeleteSubnameResult> => {
  const {
    name,
    label,
    registryAddress,
    walletClient,
    publicClient,
    signer,
    chainId,
  } = params

  if (!walletClient.account || !walletClient.chain) {
    throw new Error('Wallet client must have account and chain configured')
  }

  const writeParams = deleteSubnameV2WriteParameters(
    walletClient as Parameters<typeof deleteSubnameV2WriteParameters>[0],
    { registryAddress, label },
  )

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
        from: walletClient.account.address,
        to: registryAddress,
        data,
        value: 0n,
        chainId,
      },
    },
    signer,
    {
      description: `Delete subname ${name}`,
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
