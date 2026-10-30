import {
  buildHcaOwnerExecutionCall,
  getDestinationContracts,
} from '@ens-apps/smart-account'
import { type Address, createPublicClient, custom, type Hex } from 'viem'
import { sepolia } from 'viem/chains'
import { vi } from 'vitest'
import { buildMigrationHelperCall } from '../buildMigrationHelperCall'
import { createMigrationData } from '../encodeMigration'

/** A real encoded migration, with only the RPC boundary replaced. */
export const makeConfirmedMigration = () => {
  const owner: Address = '0x0000000000000000000000000000000000000001'
  const hca: Address = '0x0000000000000000000000000000000000000002'
  const hash: Hex = `0x${'1'.repeat(64)}`
  const blockHash: Hex = `0x${'2'.repeat(64)}`
  const contracts = getDestinationContracts(sepolia.id)
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: custom({
      request: async () => {
        throw new Error('Unexpected RPC request')
      },
    }),
  })
  const receipt = {
    status: 'success' as const,
    transactionHash: hash,
    blockNumber: 123n,
    blockHash,
    from: owner,
    to: hca,
    contractAddress: null,
    cumulativeGasUsed: 1n,
    effectiveGasPrice: 1n,
    gasUsed: 1n,
    logs: [],
    logsBloom: '0x' as const,
    transactionIndex: 0,
    type: 'legacy' as const,
  }
  const input = buildHcaOwnerExecutionCall({
    hca,
    calls: [
      buildMigrationHelperCall([
        {
          name: 'alice.eth',
          tokenType: 'unwrapped',
          parentName: 'eth',
          data: createMigrationData({ label: 'alice', owner, resolver: owner }),
        },
      ]),
    ],
  }).data
  const transaction = {
    hash,
    from: owner,
    to: hca,
    blockNumber: 123n,
    blockHash,
    input,
    chainId: sepolia.id,
    gas: 1n,
    gasPrice: 1n,
    nonce: 0,
    value: 0n,
    r: '0x' as const,
    s: '0x' as const,
    v: 27n,
    type: 'legacy' as const,
    typeHex: '0x0' as const,
    transactionIndex: 0,
  }
  const getReceipt = vi
    .spyOn(publicClient, 'getTransactionReceipt')
    .mockResolvedValue(receipt)
  const getTransaction = vi
    .spyOn(publicClient, 'getTransaction')
    .mockResolvedValue(transaction)
  vi.spyOn(publicClient, 'readContract').mockImplementation(
    async ({ functionName }) =>
      functionName === 'verifyContract'
        ? contracts.standaloneHcaImplementation
        : owner,
  )
  return {
    publicClient,
    scope: { chainId: sepolia.id, owner, hca },
    hash,
    receipt,
    transaction,
    getReceipt,
    getTransaction,
  }
}
