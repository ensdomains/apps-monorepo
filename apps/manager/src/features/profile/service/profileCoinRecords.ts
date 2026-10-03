import { resolveNameData } from '@ensdomains/ensjs/public'
import { getAddressParameters } from '@ensdomains/ensjs/utils'
import { type Client, encodeFunctionData, type Transport } from 'viem'
import type { sepoliaWithEns } from '@/lib/wagmi'
import { decodeCoinResult } from './decodeCoinRecord'

export const getProfileCoinRecords = async (
  client: Client<Transport, typeof sepoliaWithEns>,
  name: string,
  coins: readonly number[],
) => {
  if (coins.length === 0) return []

  // Fetch raw results so untrusted values are bounded before an SDK coin coder
  // can run. getRecords formats coin values internally, too early to validate.
  const result = await resolveNameData(client, {
    name,
    data: coins.map((coin) =>
      encodeFunctionData(getAddressParameters({ name, coin })),
    ),
  })

  return coins.flatMap((coin, index) => {
    const item = result?.resolvedData[index]
    if (!item?.success) return []
    const record = decodeCoinResult(coin, item.returnData)
    return record ? [record] : []
  })
}
