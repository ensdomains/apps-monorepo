import {
  type Signer,
  type TransactionRequest,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { setRecordsWriteParameters } from '@ensdomains/ensjs/wallet'
import {
  type Address,
  checksumAddress,
  encodeFunctionData,
  type PublicClient,
  type WalletClient,
} from 'viem'

type SyncEthAddressRecordParams = {
  name: string
  ownerAddress: Address
  resolverAddress: Address
  signer: Signer
  walletClient?: WalletClient | null
  publicClient: PublicClient
  chainId: number
  onTxId?: (txId: string) => void
}

const withEthSuffix = (name: string) =>
  name.endsWith('.eth') ? name : `${name}.eth`

export async function startSyncEthAddressRecordTransaction(
  params: SyncEthAddressRecordParams,
): Promise<string> {
  const {
    name,
    ownerAddress,
    resolverAddress,
    signer,
    walletClient,
    publicClient,
    chainId,
    onTxId,
  } = params

  const cleanName = withEthSuffix(name)
  const client = publicClient as unknown as Parameters<
    typeof setRecordsWriteParameters
  >[0]
  const writeParams = await setRecordsWriteParameters(client, {
    name: cleanName,
    resolverAddress,
    coins: [{ coin: 60, value: checksumAddress(ownerAddress) }],
  })

  const data = encodeFunctionData({
    abi: writeParams.abi,
    functionName: writeParams.functionName,
    args: writeParams.args,
  } as Parameters<typeof encodeFunctionData>[0])

  const eoaSigner =
    signer.type === 'eoa'
      ? signer
      : walletClient
        ? { type: 'eoa' as const, walletClient }
        : undefined

  if (!eoaSigner) {
    throw new Error(
      'Cannot sync ETH address record - owner wallet is unavailable.',
    )
  }

  const request: TransactionRequest = {
    type: 'eoa',
    from: ownerAddress,
    to: resolverAddress,
    data,
    value: 0n,
    chainId,
  }

  const txId = transactionManager.startTransaction(
    { type: 'custom', request },
    eoaSigner,
    {
      description: `Set ETH address record for ${cleanName}`,
      publicClient,
      chainId,
      operation: 'set-addr-record',
      name: cleanName,
    },
  )

  onTxId?.(txId)
  return txId
}

export async function syncEthAddressRecord(
  params: SyncEthAddressRecordParams,
): Promise<void> {
  const txId = await startSyncEthAddressRecordTransaction(params)
  await waitForTransaction(txId)
}
