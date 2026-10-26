import type { Hash, TransactionReceipt } from 'viem'
import { publicClient } from './anvil-client.js'

/** Fresh local fixtures need a mined receipt, not a later block notification.
 * Anvil can publish the receipt between viem's first lookup and its block
 * observer. Poll the receipt itself with a bounded wait and retain real data.
 */
export async function localReceipt(hash: Hash, timeoutMs = 180_000): Promise<TransactionReceipt> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try { return await publicClient.getTransactionReceipt({ hash }) }
    catch (error) { lastError = error }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error(`Local receipt ${hash} was not available after ${timeoutMs}ms; last read: ${String(lastError).slice(0, 1200)}`, { cause: lastError })
}
