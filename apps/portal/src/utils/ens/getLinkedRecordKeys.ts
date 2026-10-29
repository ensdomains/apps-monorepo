import type { EnsChain } from '@ens-apps/config'
import {
  type Address,
  type Client,
  namehash,
  parseAbiItem,
  type Transport,
} from 'viem'
import { getLogs } from 'viem/actions'
import { getAction } from 'viem/utils'

const linkedEvent = parseAbiItem(
  'event Linked(uint256 indexed recordId, bytes32 indexed node, bytes name)',
)
const textUpdatedEvent = parseAbiItem(
  'event TextUpdated(uint256 indexed recordId, string indexed keyHash, string key, string value)',
)
const addressUpdatedEvent = parseAbiItem(
  'event AddressUpdated(uint256 indexed recordId, uint256 coinType, bytes addressBytes)',
)

export type LinkedRecordKeys = {
  readonly texts: readonly string[]
  readonly coins: readonly number[]
}

/** The text keys and coin types written to a record, each once. */
export const toLinkedRecordKeys = ({
  textKeys,
  coinTypes,
}: {
  readonly textKeys: readonly (string | undefined)[]
  readonly coinTypes: readonly (bigint | undefined)[]
}): LinkedRecordKeys => ({
  texts: [
    ...new Set(textKeys.filter((key): key is string => key !== undefined)),
  ],
  coins: [
    ...new Set(
      coinTypes.flatMap((coinType) =>
        coinType !== undefined && coinType <= BigInt(Number.MAX_SAFE_INTEGER)
          ? [Number(coinType)]
          : [],
      ),
    ),
  ],
})

/**
 * The record keys an ENSv2 PermissionedResolver holds for `name`, read from
 * its own events. It stores records under the record a name is linked to, so
 * a name the indexer does not attribute to this resolver, such as an ENSv1
 * subname answered by its upgraded parent's resolver, is found here.
 */
export const getLinkedRecordKeys = async (
  client: Client<Transport, EnsChain>,
  resolver: Address,
  name: string,
): Promise<LinkedRecordKeys> => {
  const readLogs = getAction(client, getLogs, 'getLogs')
  const links = await readLogs({
    address: resolver,
    event: linkedEvent,
    args: { node: namehash(name) },
    fromBlock: 0n,
  })
  const recordId = links.at(-1)?.args.recordId
  if (recordId === undefined) return { texts: [], coins: [] }

  const [texts, addresses] = await Promise.all([
    readLogs({
      address: resolver,
      event: textUpdatedEvent,
      args: { recordId },
      fromBlock: 0n,
    }),
    readLogs({
      address: resolver,
      event: addressUpdatedEvent,
      args: { recordId },
      fromBlock: 0n,
    }),
  ])
  return toLinkedRecordKeys({
    textKeys: texts.map(({ args }) => args.key),
    coinTypes: addresses.map(({ args }) => args.coinType),
  })
}
