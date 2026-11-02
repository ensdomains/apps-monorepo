import type { PublicClient } from 'viem'

/** Only an operation's overlapping head reads share work; confirmations stay fresh. */
export const coalesceLatestBlockReads = <T extends PublicClient>(
  client: T,
): T => {
  let pending: ReturnType<PublicClient['getBlock']> | undefined
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property !== 'getBlock')
        return Reflect.get(target, property, receiver)
      return (args?: Parameters<PublicClient['getBlock']>[0]) => {
        const isLatest =
          args?.blockNumber === undefined &&
          args?.blockHash === undefined &&
          (args?.blockTag ?? target.experimental_blockTag ?? 'latest') ===
            'latest' &&
          args?.includeTransactions !== true
        if (!isLatest) return target.getBlock(args)
        pending ??= target.getBlock(args).finally(() => {
          pending = undefined
        })
        return pending
      }
    },
  })
}
