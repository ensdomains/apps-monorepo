import type { Result } from 'neverthrow'
import type { PublicClient } from 'viem'
import { prepareENSRenewalTransaction } from './rhinestone-account.helpers'

/**
 * Gets the renewal price for an ENS name
 */
export async function getENSRenewalPrice(
  publicClient: PublicClient,
  name: string,
  duration: bigint
): Promise<Result<bigint, Error>> {
  const result = await prepareENSRenewalTransaction(publicClient, { name, duration })
  return result.map(tx => tx.value).mapErr(err => err as Error)
}
