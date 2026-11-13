import {
  type Address,
  decodeFunctionResult,
  encodeFunctionData,
  namehash,
} from 'viem'
import { V1_PUBLIC_RESOLVER } from '../../fixtures/makeV1Name.js'
import {
  RESOLVER_ABI,
  recordChecks,
  type V1Records,
} from '../../fixtures/v1-records.js'
import { publicClient } from '../../helpers/anvil-client.js'

/** Original storage is checked independently of whether the name still resolves. */
export async function sourceRecords(
  name: string,
  records: V1Records,
  resolver: Address = V1_PUBLIC_RESOLVER,
) {
  return Promise.all(
    recordChecks(namehash(name), records).map(async (check) => {
      const call = {
        abi: RESOLVER_ABI,
        functionName: check.functionName,
        args: check.args,
      } as never
      try {
        const result = await publicClient.call({
          to: resolver,
          data: encodeFunctionData(call),
        })
        const decoded = decodeFunctionResult({
          ...(call as object),
          data: result.data,
        } as never)
        return {
          what: check.what,
          want: check.want,
          got: check.normalise(decoded),
          raw: result.data,
        }
      } catch (error) {
        return {
          what: check.what,
          want: check.want,
          got: `read failed: ${String(error).split('\n')[0]}`,
        }
      }
    }),
  )
}

/** Store real local log identities, never simulated indexer events. */
export async function chainActivity(fromBlock: bigint, toBlock?: bigint) {
  const end = toBlock ?? (await publicClient.getBlockNumber({ cacheTime: 0 }))
  const logs = await publicClient.getLogs({ fromBlock, toBlock: end })
  return {
    fromBlock,
    toBlock: end,
    events: logs.map((l) => ({
      address: l.address,
      transactionHash: l.transactionHash,
      blockHash: l.blockHash,
      blockNumber: l.blockNumber,
      transactionIndex: l.transactionIndex,
      logIndex: l.logIndex,
      topics: l.topics,
      data: l.data,
    })),
    layer:
      'Actual RPC logs. Indexer accessibility and app history are separate checks.',
  }
}
