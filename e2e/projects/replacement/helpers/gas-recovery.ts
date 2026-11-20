import type { Address } from 'viem'
import { publicClient, walletClient } from '../../../helpers/anvil-client.js'

type Trace = { error?: string; calls?: Trace[] }
const outOfGas = (trace: Trace): boolean =>
  /out of gas/i.test(trace.error ?? '') || (trace.calls ?? []).some(outOfGas)

/** Only this freshly seeded fixture's failed transaction can be replayed. */
export async function retryCurrentOutOfGas(startBlock: bigint, actor: Address) {
  const url = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname))
    throw new Error('Gas recovery requires a local test chain')
  const versionResponse = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'web3_clientVersion',
      params: [],
    }),
  })
  const { result: version } = (await versionResponse.json()) as {
    result: string
  }
  if (!version.toLowerCase().includes('anvil'))
    throw new Error('Gas recovery requires Anvil')
  const end = await publicClient.getBlockNumber({ cacheTime: 0 })
  if (end - startBlock > 200n)
    throw new Error('Unexpected concurrent chain activity; refusing replay')
  for (let number = end; number >= startBlock; number--) {
    const block = await publicClient.getBlock({
      blockNumber: number,
      includeTransactions: true,
    })
    for (const tx of block.transactions) {
      if (tx.from.toLowerCase() !== actor.toLowerCase() || !tx.to) continue
      const receipt = await publicClient.getTransactionReceipt({
        hash: tx.hash,
      })
      if (receipt.status !== 'reverted') continue
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'debug_traceTransaction',
          params: [tx.hash, { tracer: 'callTracer' }],
        }),
      })
      const trace = (await response.json()) as {
        result?: Trace
        error?: unknown
      }
      if (!trace.result || !outOfGas(trace.result)) continue
      const gas = tx.gas * 4n > 3_000_000n ? tx.gas * 4n : 3_000_000n
      if (gas > 8_000_000n) throw new Error('Unexpected replay request')
      await publicClient.call({
        account: actor,
        to: tx.to,
        data: tx.input,
        value: tx.value,
        gas,
      })
      const hash = await walletClient.sendTransaction({
        account: actor,
        to: tx.to,
        data: tx.input,
        value: tx.value,
        gas,
      })
      const retried = await publicClient.waitForTransactionReceipt({ hash })
      if (retried.status !== 'success')
        throw new Error(`Gas recovery reverted: ${hash}`)
      return {
        original: tx.hash,
        retry: hash,
        gas: String(gas),
        status: retried.status,
      }
    }
  }
  throw new Error(
    'No out-of-gas transaction belonging to this fixture; original migration failure is not recoverable by this workaround',
  )
}
