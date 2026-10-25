import { holdsSyncableWrapper } from '@ens-apps/migration'
import {
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import {
  SECONDS_PER_DAY,
  V1_GRACE_PERIOD_DAYS,
} from '@ens-apps/utils/gracePeriod'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { registryOwnerSnippet } from '@ensdomains/ensjs-abi/registry'
import { baseRegistrarNameExpiresSnippet } from '@ensdomains/ensjs-abi/v1/baseRegistrar'
import { nameWrapperGetDataSnippet } from '@ensdomains/ensjs-abi/v1/nameWrapper'
import {
  type Address,
  encodeFunctionData,
  erc721Abi,
  isAddressEqual,
  type PublicClient,
  parseAbi,
  type WalletClient,
} from 'viem'
import { labelhash, namehash } from 'viem/ens'
import { envConfig } from '@/config'
import { resolveRenewalLabel } from '@/features/renew/utils/renewableName'
import { V1_CONTRACTS } from '../contracts/addresses'
import type { ClassifiedName } from './classifyNames'

const WRAPPER_GRACE_SECONDS = BigInt(V1_GRACE_PERIOD_DAYS * SECONDS_PER_DAY)
const SYNC_WRAPPER_ABI = parseAbi(['function syncWrapper(string[] labels)'])

export class WrapperSyncError extends TaggedError('WrapperSyncError')<{
  readonly reason:
    | 'not-connected'
    | 'wrong-network'
    | 'wrong-wallet'
    | 'name-unavailable'
    | 'reverted'
    | 'unconfirmed'
  readonly cause?: unknown
}> {}

const readWrapperSyncState = async (params: {
  readonly names: readonly ClassifiedName[]
  readonly owner: Address
  readonly publicClient: PublicClient
  readonly blockNumber?: bigint
}) => {
  const { names, owner, publicClient } = params
  const block = await publicClient.getBlock(
    params.blockNumber === undefined
      ? { blockTag: 'latest' }
      : { blockNumber: params.blockNumber },
  )
  return Promise.all(
    names.map(async (name) => {
      const label = resolveRenewalLabel(name.domain.name)
      if (
        name.action !== 'migrate' ||
        name.parentName !== 'eth' ||
        label.isErr()
      ) {
        throw new WrapperSyncError({
          reason: 'name-unavailable',
          message: `Cannot sync ${name.domain.name}.`,
        })
      }
      const node = namehash(name.domain.name)
      const tokenId = BigInt(labelhash(label.value))
      const [expiry, registrant, registryOwner, wrapperData] =
        await Promise.all([
          publicClient.readContract({
            address: V1_CONTRACTS.BaseRegistrar,
            abi: baseRegistrarNameExpiresSnippet,
            functionName: 'nameExpires',
            args: [tokenId],
            blockNumber: block.number,
          }),
          publicClient.readContract({
            address: V1_CONTRACTS.BaseRegistrar,
            abi: erc721Abi,
            functionName: 'ownerOf',
            args: [tokenId],
            blockNumber: block.number,
          }),
          publicClient.readContract({
            address: V1_CONTRACTS.LegacyRegistry,
            abi: registryOwnerSnippet,
            functionName: 'owner',
            args: [node],
            blockNumber: block.number,
          }),
          publicClient.readContract({
            address: V1_CONTRACTS.NameWrapper,
            abi: nameWrapperGetDataSnippet,
            functionName: 'getData',
            args: [BigInt(node)],
            blockNumber: block.number,
          }),
        ])
      if (
        expiry <= block.timestamp ||
        !isAddressEqual(registrant, V1_CONTRACTS.NameWrapper) ||
        !isAddressEqual(registryOwner, V1_CONTRACTS.NameWrapper) ||
        !holdsSyncableWrapper(name, wrapperData, owner, block.timestamp)
      ) {
        throw new WrapperSyncError({
          reason: 'name-unavailable',
          message: `${name.domain.name} is no longer available to sync. Refresh your names and try again.`,
        })
      }
      return {
        label: label.value,
        needsSync: wrapperData[2] < expiry + WRAPPER_GRACE_SECONDS,
      }
    }),
  )
}

/** Repair only expiry metadata; the existing transaction manager owns submission and confirmation. */
export const syncMigrationWrappers = async (params: {
  readonly names: readonly ClassifiedName[]
  readonly owner: Address
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
}): Promise<void> => {
  const { names, owner, walletClient, publicClient } = params
  if (names.length === 0) return
  const chainId = envConfig.chain.id
  const [walletChainId, addresses] = await Promise.all([
    walletClient.getChainId(),
    walletClient.getAddresses(),
  ])
  if (publicClient.chain?.id !== chainId || walletChainId !== chainId) {
    throw new WrapperSyncError({
      reason: 'wrong-network',
      message: 'Switch to the migration network and try again.',
    })
  }
  if (!addresses.some((address) => isAddressEqual(address, owner))) {
    throw new WrapperSyncError({
      reason: 'wrong-wallet',
      message: 'Reconnect the wallet that owns these names.',
    })
  }
  const states = await readWrapperSyncState(params)
  const labels = [
    ...new Set(
      states.filter(({ needsSync }) => needsSync).map(({ label }) => label),
    ),
  ]
  if (labels.length === 0) return
  const address = envConfig.chain.contracts.ensEthRenewerV1.address
  await publicClient.simulateContract({
    account: owner,
    address,
    abi: SYNC_WRAPPER_ABI,
    functionName: 'syncWrapper',
    args: [labels],
  })
  const txId = transactionManager.startTransaction(
    {
      type: 'custom',
      request: {
        type: 'eoa',
        from: owner,
        to: address,
        chainId,
        value: 0n,
        data: encodeFunctionData({
          abi: SYNC_WRAPPER_ABI,
          functionName: 'syncWrapper',
          args: [labels],
        }),
      },
    },
    { type: 'eoa', walletClient },
    {
      description: 'Sync names before upgrading',
      publicClient,
      chainId,
      operation: 'sync-wrapper',
    },
  )
  const { hash, receipt } = await waitForTransaction(txId)
  const confirmed =
    receipt ?? (await publicClient.waitForTransactionReceipt({ hash }))
  if (confirmed.status !== 'success')
    throw new WrapperSyncError({
      reason: 'reverted',
      message: 'Name sync reverted. Please try again.',
    })
  const refreshed = await readWrapperSyncState({
    ...params,
    blockNumber: confirmed.blockNumber,
  })
  if (refreshed.some(({ needsSync }) => needsSync)) {
    throw new WrapperSyncError({
      reason: 'unconfirmed',
      message:
        'Could not confirm the updated expiry. Refresh your names before trying again.',
    })
  }
}
