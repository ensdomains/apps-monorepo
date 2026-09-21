import {
  getSmartAccountAddress,
  type Signer,
  type TransactionRequest,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { type Address, checksumAddress, type PublicClient } from 'viem'
import { requireCanonicalPrimaryName } from '@/features/profile/service/profileName'
import {
  encodeResolverRecordsCall,
  getResolverSetterKind,
} from '@/features/profile/service/resolverRecordCalls'

type SyncEthAddressRecordParams = {
  name: string
  ownerAddress: Address
  resolverAddress: Address
  signer: Signer
  accountAddress: Address
  publicClient: PublicClient
  chainId: number
  onTxId?: (txId: string) => void
}

export async function startSyncEthAddressRecordTransaction(
  params: SyncEthAddressRecordParams,
): Promise<string> {
  const {
    name,
    ownerAddress,
    resolverAddress,
    signer,
    accountAddress,
    publicClient,
    chainId,
    onTxId,
  } = params

  const cleanName = requireCanonicalPrimaryName(name)

  // Encoded for the resolver's setter family: the name-based V2 setters and
  // the node-based public/legacy ones revert on each other's selectors.
  const data = await encodeResolverRecordsCall({
    kind: await getResolverSetterKind(publicClient, resolverAddress),
    name: cleanName,
    records: { coins: [{ coin: 60, value: checksumAddress(ownerAddress) }] },
  })

  const from =
    signer.type === 'eoa' ? accountAddress : getSmartAccountAddress(signer)

  const request: TransactionRequest =
    signer.type === 'eoa'
      ? {
          type: 'eoa',
          from,
          to: resolverAddress,
          data,
          value: 0n,
          chainId,
        }
      : {
          type: 'rhinestone-intent',
          from,
          chainId,
          rhinestoneParams: {
            calls: [{ to: resolverAddress, data, value: 0n }],
            // User-paid in USDC out of the HCA's own balance — this deployment
            // has no gas sponsorship. NOTE: no funding leg here. The HCA route
            // no longer reaches this (the reveal batch writes the addr record
            // itself), but if it ever does, route the calls through
            // `planHcaIntentFunding` first.
            feeAsset: 'USDC',
          },
        }

  const txId = transactionManager.startTransaction(
    { type: 'custom', request },
    signer,
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
